/**
 * Filas BullMQ do projeto — spec §3.2 (Webhook → Fila → Pipeline de
 * ingestão). Conexão Redis vem sempre de `REDIS_URL` (nunca hardcoded).
 */

import { Queue } from "bullmq";
import type { RawReceipt } from "@/modules/ingestion";

export const RECEIPT_QUEUE = "receipt-processing";

/** Payload do job de ingestão — o buffer trafega em base64 (Redis é texto). */
export interface ReceiptJobData {
  readonly tenantId: string;
  readonly receiptId: string;
  readonly buffer: string;
  readonly mimeType: string;
  readonly source: RawReceipt["source"];
  readonly receivedAt: string;
}

function redisUrl(): string {
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error("REDIS_URL não configurado.");
  }
  return url;
}

let receiptQueue: Queue<ReceiptJobData> | undefined;

/**
 * Instância única da fila, criada sob demanda — evita abrir uma conexão
 * Redis nova a cada chamada (ex.: uma por request no endpoint HTTP).
 */
export function getReceiptQueue(): Queue<ReceiptJobData> {
  if (!receiptQueue) {
    receiptQueue = new Queue<ReceiptJobData>(RECEIPT_QUEUE, {
      connection: { url: redisUrl(), maxRetriesPerRequest: null },
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    });
  }
  return receiptQueue;
}
