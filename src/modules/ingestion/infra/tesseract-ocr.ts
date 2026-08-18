/**
 * OCR local (Tier 2) — spec §7.1/§7.2: extrai texto de uma imagem antes
 * de tentar regex, sem chamar nenhum modelo pago. Fica em `infra/`
 * porque `tesseract.js` roda um binário/WASM local — não é I/O de rede,
 * mas também não é computação pura o suficiente para `domain/`.
 *
 * Nunca lança: falha de OCR (imagem ilegível, worker não inicializa)
 * volta `""`, que a cascata trata como "tier sem contribuição" (spec
 * §7.1, ver `domain/pipeline.ts`), nunca como erro de infraestrutura.
 *
 * Cria e termina um worker do Tesseract por chamada — mais simples e
 * seguro que manter um worker global vivo entre jobs; se o throughput
 * exigir, um pool reutilizável é otimização de tarefa futura.
 */

import { createWorker } from "tesseract.js";
import { logger } from "@/shared/logger";

export async function extractTextFromImage(buffer: Buffer): Promise<string> {
  try {
    const worker = await createWorker("por");
    try {
      const { data } = await worker.recognize(buffer);
      logger.debug("texto extraído via OCR", { chars: data.text.length });
      return data.text;
    } finally {
      await worker.terminate();
    }
  } catch (error) {
    logger.error("falha ao extrair texto via OCR", { error });
    return "";
  }
}
