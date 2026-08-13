/**
 * Worker BullMQ que processa jobs de `receipt-processing` — spec §3.2.
 * Concorrência 1: OCR local disputa CPU com Postgres/Redis na mesma VPS
 * (risco C-30) — um job por vez evita saturar o recurso compartilhado.
 *
 * Nunca importa `db` diretamente — as dependências de `ingestReceipt`
 * (checkDuplicate, extração) entram via stub até o banco e o VLM
 * estarem conectados (tarefas futuras).
 */

import { Worker, type Job } from "bullmq";
import type { TenantContext } from "@/db/client";
import { ingestReceipt, type IngestDeps, type RawReceipt } from "@/modules/ingestion";
import { isErr } from "@/shared/result";
import { RECEIPT_QUEUE, type ReceiptJobData } from "./queues";

function redisUrl(): string {
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error("REDIS_URL não configurado.");
  }
  return url;
}

// TODO: substituir pelos deps reais quando banco e VLM estiverem
// conectados — por enquanto nunca deduplica e nunca extrai de fato.
const deps: IngestDeps = {
  checkDuplicate: () => Promise.resolve(false),
  runDeterministicExtraction: () => ({}),
};

/**
 * Exceção não tratada aqui propaga para o BullMQ, que reencaminha o job
 * conforme `attempts`/`backoff` (defaultJobOptions em `queues.ts`) — só
 * o resultado de negócio (`Result` de `ingestReceipt`) é logado, nunca
 * lançado, pois não é falha de infraestrutura (CLAUDE.md, spec §3.3).
 */
async function processReceiptJob(job: Job<ReceiptJobData>): Promise<void> {
  const { tenantId, receiptId, mimeType, buffer, source, receivedAt } = job.data;
  console.log("[receipt-worker] processando job", { tenantId, receiptId, mimeType });

  const bufferBytes = Buffer.from(buffer, "base64");
  const raw: RawReceipt = {
    buffer: bufferBytes,
    mimeType,
    sizeBytes: bufferBytes.length,
    source,
    receivedAt: new Date(receivedAt),
  };

  const ctx: TenantContext = { tenantId };
  const result = await ingestReceipt(ctx, raw, deps);

  if (isErr(result)) {
    console.error("[receipt-worker] ingestReceipt retornou erro", {
      receiptId,
      error: result.error,
    });
  } else {
    console.log("[receipt-worker] ingestReceipt concluído", {
      receiptId,
      confidence: result.value.confidence,
    });
  }
}

export const receiptWorker = new Worker<ReceiptJobData>(RECEIPT_QUEUE, processReceiptJob, {
  connection: { url: redisUrl(), maxRetriesPerRequest: null },
  concurrency: 1,
});

/** Desligamento gracioso — C-31: reinício de servidor não pode deixar job preso em `processing`. */
async function shutdown(signal: string): Promise<void> {
  console.log(`[receipt-worker] recebido ${signal}, encerrando graciosamente...`);
  await receiptWorker.close();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
