/**
 * Caso de uso que orquestra a cascata de extração (spec §7.1) para um
 * `RawReceipt`: decide qual tier rodar, mescla os resultados
 * (`domain/pipeline.ts`) e valida a saída final contra o contrato
 * (CLAUDE.md invariante 4). Toda dependência externa — checagem de
 * duplicata, extrator determinístico, OCR, VLM — entra via `IngestDeps`;
 * este arquivo nunca importa `db`, storage ou HTTP diretamente.
 */

import type { TenantContext } from "@/db/client";
import type { Result } from "@/shared/result";
import { err, isErr, ok } from "@/shared/result";
import { logger } from "@/shared/logger";
import { extractFromText } from "../domain/deterministic-extractor";
import { computeHash, computePerceptualHash, normalizeImage, normalizeMime } from "../domain/normalizer";
import { extractPdfText } from "../domain/pdf-text";
import { mergeExtractions } from "../domain/pipeline";
import type { ExtractionTierContribution } from "../domain/pipeline";
import { validateExtractionOutput } from "../domain/extraction-schema";
import type { ExtractionOutput, RawReceipt } from "../domain/types";

/**
 * Abaixo desse limiar de confiança, o Tier 3 (VLM barato) é acionado —
 * spec §7.1/§7.5. Exportado porque é o mesmo número que decide
 * `receipts.status` ("extracted" vs "review") em quem persiste o
 * resultado (hoje `receipt-worker.ts`) — um só lugar define o limiar.
 */
export const VLM_CONFIDENCE_THRESHOLD = 0.85;

/** `receipts.status` para um resultado `Ok` — mesmo limiar usado para decidir VLM acima. */
export function decideReceiptStatus(confidence: number): "extracted" | "review" {
  return confidence >= VLM_CONFIDENCE_THRESHOLD ? "extracted" : "review";
}

export type IngestError =
  | "unsupported_mime"
  | "duplicate"
  | "not_a_receipt"
  | "extraction_failed"
  | "validation_failed";

export interface IngestDeps {
  checkDuplicate(hash: string): Promise<boolean>;
  /** Tier 0 quase-duplicata (spec §7.1/C-02) — só chamado para imagem, com o aHash já computado. */
  checkNearDuplicate?(perceptualHash: string): Promise<boolean>;
  runDeterministicExtraction(text: string): Partial<ExtractionOutput>;
  runOcrExtraction?(image: Buffer): Promise<string>;
  runVlmExtraction?(image: Buffer): Promise<Partial<ExtractionOutput>>;
}

/**
 * Ordem obrigatória (spec §7.1): mime → duplicata → normalização de
 * imagem → determinístico → OCR (imagem, Tier 2) → VLM (só para
 * não-imagem, se confiança baixa) → merge → validação. `ctx` não é
 * usado diretamente aqui — as dependências que tocam banco/storage/fila
 * já chegam com o tenant amarrado por quem monta `IngestDeps`; o
 * parâmetro existe para manter o caso de uso assinável como ponto de
 * entrada tenant-aware (CLAUDE.md invariante 3).
 */
export async function ingestReceipt(
  ctx: TenantContext,
  raw: RawReceipt,
  deps: IngestDeps,
): Promise<Result<ExtractionOutput, IngestError>> {
  void ctx;

  const mimeResult = normalizeMime(raw.buffer);
  if (isErr(mimeResult)) return err("unsupported_mime");
  const mime = mimeResult.value;

  const hash = computeHash(raw.buffer);
  if (await deps.checkDuplicate(hash)) return err("duplicate");

  const isImage = mime.startsWith("image/");

  // Tier 0 quase-duplicata (spec §7.1/C-02): reenvio recortado/recomprimido
  // do MESMO comprovante não bate no hash exato acima, mas bate no aHash.
  // Só para imagem — PDF de texto não tem essa classe de reenvio. Falha ao
  // computar (buffer corrompido que passou pelo magic-byte check) não deve
  // derrubar a ingestão: segue sem checar quase-duplicata.
  if (isImage && deps.checkNearDuplicate) {
    let perceptualHash: string | undefined;
    try {
      perceptualHash = await computePerceptualHash(raw.buffer);
    } catch {
      perceptualHash = undefined;
    }
    if (perceptualHash && (await deps.checkNearDuplicate(perceptualHash))) {
      return err("duplicate");
    }
  }

  const normalizedImage = isImage ? await normalizeImage(raw.buffer) : null;

  // Tier 1 texto (spec §7.1): para PDF, extrai a camada de texto real via
  // `pdfjs-dist` (`extractPdfText`, nunca lança — PDF sem camada de texto
  // ou corrompido devolve "", igual a "sem contribuição" deste tier); para
  // imagem, não há texto nativo, então o determinístico roda vazio aqui e
  // o texto real vem do OCR abaixo.
  const deterministicText = isImage ? "" : await extractPdfText(raw.buffer);

  let deterministicOutput: Partial<ExtractionOutput>;
  try {
    deterministicOutput = deps.runDeterministicExtraction(deterministicText);
  } catch {
    return err("extraction_failed");
  }

  const tiers: ExtractionTierContribution[] = [{ tier: "deterministic", output: deterministicOutput }];

  // Tier 2 (spec §7.1) — só para imagem, e só se o worker injetou OCR.
  let ranOcr = false;
  if (isImage && deps.runOcrExtraction) {
    ranOcr = true;
    let ocrText: string;
    try {
      ocrText = await deps.runOcrExtraction(normalizedImage ?? raw.buffer);
    } catch {
      return err("extraction_failed");
    }
    tiers.push({ tier: "ocr", output: extractFromText(ocrText) });
  }

  const deterministicMerge = mergeExtractions(tiers);
  if (isErr(deterministicMerge)) return err("not_a_receipt");

  if (ranOcr) {
    const auto = deterministicMerge.value.confidence >= VLM_CONFIDENCE_THRESHOLD;
    logger.debug("confiança pós-OCR", {
      confidence: deterministicMerge.value.confidence,
      decision: auto ? "auto" : "review",
    });
  }

  // VLM (Tier 3) nunca entra no caminho de imagem/OCR (confiança baixa
  // aí vira revisão humana, não uma segunda tentativa via modelo) —
  // só se aplica a não-imagem, e só quando o dep está presente.
  if (
    !isImage &&
    deterministicMerge.value.confidence < VLM_CONFIDENCE_THRESHOLD &&
    deps.runVlmExtraction
  ) {
    let vlmOutput: Partial<ExtractionOutput>;
    try {
      vlmOutput = await deps.runVlmExtraction(normalizedImage ?? raw.buffer);
    } catch {
      return err("extraction_failed");
    }
    tiers.push({ tier: "vlm_cheap", output: vlmOutput });
  }

  const merged = mergeExtractions(tiers);
  if (isErr(merged)) return err("not_a_receipt");

  const validated = validateExtractionOutput(merged.value);
  if (isErr(validated)) return err("validation_failed");

  return ok(validated.value);
}
