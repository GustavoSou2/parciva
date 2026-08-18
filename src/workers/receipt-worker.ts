/**
 * Worker BullMQ que processa jobs de `receipt-processing` — spec §3.2.
 * Concorrência 1: OCR local disputa CPU com Postgres/Redis na mesma VPS
 * (risco C-30) — um job por vez evita saturar o recurso compartilhado.
 * A mesma serialização é o que torna seguro o dedupe "soft" (SELECT, não
 * claim atômico) de `receiptExistsByHash` — ver comentário em
 * `receipt-repository.ts`.
 *
 * `runOcrExtraction` (Tier 2, spec §7.1) e `runDeterministicExtraction`
 * (Tier 1) já são reais. VLM (Tier 3, `anthropic-vlm.ts`) segue
 * existindo no módulo `ingestion`, mas não é usado aqui por ora — sem
 * VLM na cascata, imagem com confiança baixa após OCR vai para revisão
 * humana, não para o modelo pago (ver `application/ingest-receipt.ts`).
 *
 * Persistência roda AQUI, depois de `ingestReceipt` resolver — não
 * dentro de `IngestDeps` — porque `application/ingest-receipt.ts`
 * documenta explicitamente que nunca importa db/storage/HTTP
 * diretamente, e o resultado (`ExtractionOutput`) já é tudo que este
 * arquivo precisa para gravar `receipts`/`receipt_extractions`.
 */

import { Worker, type Job } from "bullmq";
import type { TenantContext } from "@/db/client";
import {
  computeHash,
  computePerceptualHash,
  createReceipt,
  extractFromText,
  extractTextFromImage,
  findNearDuplicateByPerceptualHash,
  ingestReceipt,
  PHASH_NEAR_DUPLICATE_MAX_DISTANCE,
  receiptExistsByHash,
  saveExtraction,
  updateReceiptStatus,
  type ExtractionTier,
  type IngestDeps,
  type RawReceipt,
} from "@/modules/ingestion";
import { listPayers } from "@/modules/payers";
import { listContractsByPayer, listInstallmentsByContract } from "@/modules/contracts";
import {
  createProposal,
  executeReceiptPayment,
  processReceiptExtraction,
  type ProcessReceiptExtractionDeps,
} from "@/modules/reconciliation";
import { getAutoApprovalCeilingCents } from "@/modules/tenant";
import { enforceQuota, getCurrentUsage, getLimits, incrementUsage } from "@/modules/billing";
import { saveReceiptFile } from "@/shared/storage";
import { isErr } from "@/shared/result";
import { logger } from "@/shared/logger";
import { RECEIPT_QUEUE, type ReceiptJobData } from "./queues";

function redisUrl(): string {
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error("REDIS_URL não configurado.");
  }
  return url;
}

/** Mapeamento mime→extensão limitado aos tipos que `normalizeMime` reconhece (Tier 0). */
const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

function extFromMime(mimeType: string): string {
  return EXT_BY_MIME[mimeType] ?? "bin";
}

function buildDeps(ctx: TenantContext): IngestDeps {
  return {
    checkDuplicate: (hash) => receiptExistsByHash(ctx, hash),
    checkNearDuplicate: (hash) =>
      findNearDuplicateByPerceptualHash(ctx, hash, PHASH_NEAR_DUPLICATE_MAX_DISTANCE),
    runDeterministicExtraction: extractFromText,
    runOcrExtraction: extractTextFromImage,
  };
}

function buildReconciliationDeps(ctx: TenantContext): ProcessReceiptExtractionDeps {
  return {
    listPayers: () => listPayers(ctx),
    listContractsByPayer: (payerId) => listContractsByPayer(ctx, payerId),
    listInstallmentsByContract: (contractId) => listInstallmentsByContract(ctx, contractId),
    getAutoApprovalCeilingCents: () => getAutoApprovalCeilingCents(ctx.tenantId),
    executeReceiptPayment: (input) => executeReceiptPayment(ctx, input),
    createProposal: (data) => createProposal(ctx, data),
  };
}

/** Erro de negócio (não duplicado) → `receipts.status` final quando não há extração para salvar. */
const REJECTED_STATUS_BY_ERROR: Partial<Record<string, "rejected" | "failed">> = {
  unsupported_mime: "rejected",
  not_a_receipt: "rejected",
  validation_failed: "rejected",
  extraction_failed: "failed",
};

/**
 * Exceção não tratada aqui propaga para o BullMQ, que reencaminha o job
 * conforme `attempts`/`backoff` (defaultJobOptions em `queues.ts`) — a
 * persistência abaixo não é envolvida em try/catch de propósito: falha
 * de banco/storage é infraestrutura, não resultado de negócio, e deve
 * propagar (CLAUDE.md, spec §3.3). Só o `Result` de `ingestReceipt` é
 * logado, nunca lançado.
 */
async function processReceiptJob(job: Job<ReceiptJobData>): Promise<void> {
  const { tenantId, receiptId, mimeType, buffer, source, receivedAt, fromPhone } = job.data;
  logger.info("processando job", { tenantId, receiptId, mimeType });

  // Ponto de verdade da cota (spec §11.3) — o pré-filtro no enqueue
  // (`api/webhooks/whatsapp/route.ts`) só consulta; É AQUI que
  // `enforceQuota()` incrementa `usage_counters` de verdade, uma vez
  // por comprovante realmente processado. Sem `receipts`/`storage`
  // gravados ainda neste ponto — mesmo padrão do caminho "duplicado"
  // abaixo: rejeitado antes de existir qualquer rastro persistido.
  // Achado conhecido, não corrigido aqui: se o job FALHAR depois deste
  // ponto e o BullMQ reencaminhar (retry), o incremento roda de novo
  // pra a mesma mensagem — sobrecontagem rara, só em falha de
  // infraestrutura, não em operação normal.
  const ctx: TenantContext = { tenantId };
  const quota = await enforceQuota(ctx, "receipts_per_month", { getLimits, getCurrentUsage, incrementUsage });
  if (isErr(quota)) {
    logger.warn("cota de comprovantes/mês excedida — comprovante descartado no worker", {
      tenantId,
      receiptId,
      error: quota.error,
    });
    return;
  }

  const bufferBytes = Buffer.from(buffer, "base64");
  const raw: RawReceipt = {
    buffer: bufferBytes,
    mimeType,
    sizeBytes: bufferBytes.length,
    source,
    receivedAt: new Date(receivedAt),
    ...(fromPhone ? { fromPhone } : {}),
  };

  const result = await ingestReceipt(ctx, raw, buildDeps(ctx));

  if (isErr(result) && result.error === "duplicate") {
    // Corpo já existe em `receipts` (dedupe por content_hash) — inclusive
    // o caso de retry do BullMQ após falha depois de já ter persistido:
    // o próximo checkDuplicate acha a linha e cai aqui, sem duplicar nada.
    logger.info("comprovante duplicado, ignorando", { receiptId });
    return;
  }

  // Original preservado para perícia (spec §8) — nunca o buffer normalizado.
  const contentHash = computeHash(bufferBytes);
  const storageKey = await saveReceiptFile(tenantId, contentHash, extFromMime(mimeType), bufferBytes);

  // Só para imagem (mesmo escopo do check de quase-duplicata em
  // ingest-receipt.ts) — PDF de texto não tem essa classe de reenvio.
  // Recomputado aqui (não reaproveitado de `ingestReceipt`) para manter
  // este arquivo o único ponto que decide o que grava em `receipts` —
  // mesmo padrão já usado para `contentHash` acima. Falha não deve
  // impedir a gravação do comprovante.
  let perceptualHash: string | undefined;
  if (mimeType.startsWith("image/")) {
    try {
      perceptualHash = await computePerceptualHash(bufferBytes);
    } catch {
      perceptualHash = undefined;
    }
  }

  await createReceipt(ctx, {
    id: receiptId,
    source,
    storageKey,
    mimeType,
    sizeBytes: bufferBytes.length,
    contentHash,
    ...(perceptualHash ? { perceptualHash } : {}),
    receivedAt: new Date(receivedAt),
  });

  if (isErr(result)) {
    logger.error("ingestReceipt retornou erro", { receiptId, error: result.error });
    await updateReceiptStatus(ctx, receiptId, REJECTED_STATUS_BY_ERROR[result.error] ?? "failed");
    return;
  }

  logger.info("ingestReceipt concluído", {
    receiptId,
    confidence: result.value.confidence,
    method: result.value.method,
    amount_cents: result.value.amount_cents,
    paid_at: result.value.paid_at,
    transaction_ref: result.value.transaction_ref,
    payer_name: result.value.payer_name,
    institution: result.value.institution,
  });

  const isImage = mimeType.startsWith("image/");
  const tier: ExtractionTier = isImage ? "ocr" : "deterministic";
  await saveExtraction(ctx, {
    receiptId,
    tier,
    data: result.value,
    fieldConfidence: result.value.field_confidence,
    overallConfidence: result.value.confidence,
  });

  const reconciliationOutcome = await processReceiptExtraction(
    ctx,
    { receiptId, extraction: result.value, ...(fromPhone ? { fromPhone } : {}) },
    buildReconciliationDeps(ctx),
  );
  logger.info("processReceiptExtraction concluído", { receiptId, outcome: reconciliationOutcome });
  await updateReceiptStatus(ctx, receiptId, reconciliationOutcome === "applied" ? "applied" : "review");
}

export const receiptWorker = new Worker<ReceiptJobData>(RECEIPT_QUEUE, processReceiptJob, {
  connection: { url: redisUrl(), maxRetriesPerRequest: null },
  concurrency: 1,
});

receiptWorker.on("error", (err) => {
  logger.error("worker erro", { error: err });
});
receiptWorker.on("ready", () => {
  logger.info("worker conectado ao Redis e pronto");
});
receiptWorker.on("active", (job) => {
  logger.info("worker processando job", { jobId: job.id });
});

// Desligamento gracioso (C-31: reinício de servidor não pode deixar job
// preso em `processing`) é responsabilidade única de `main.ts` — dois
// `process.on(SIGTERM)` independentes, cada um com seu próprio
// `process.exit(0)`, correm o risco real de um matar o processo antes
// do outro terminar de fechar sua conexão (achado ao adicionar o worker
// de renovação de assinatura, decisão [25]).
