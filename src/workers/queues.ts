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
  /** E.164, sem prefixo `whatsapp:` — ver `RawReceipt.fromPhone`. */
  readonly fromPhone?: string;
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

/** Cron de renovação de assinatura (spec §14 Fase 4, decisão [25]) — sem payload, só dispara o cron. */
export const BILLING_RENEWAL_QUEUE = "billing-renewal";

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- job sem payload, ver comentário acima
export interface BillingRenewalJobData {}

let billingRenewalQueue: Queue<BillingRenewalJobData> | undefined;

export function getBillingRenewalQueue(): Queue<BillingRenewalJobData> {
  if (!billingRenewalQueue) {
    billingRenewalQueue = new Queue<BillingRenewalJobData>(BILLING_RENEWAL_QUEUE, {
      connection: { url: redisUrl(), maxRetriesPerRequest: null },
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: 30,
        removeOnFail: 100,
      },
    });
  }
  return billingRenewalQueue;
}

/**
 * Repetível diário — `jobId` fixo faz o BullMQ deduplicar pelo mesmo
 * agendamento em toda reinicialização do worker, nunca acumula um
 * segundo cron correndo em paralelo. 03:00 UTC (madrugada em qualquer
 * fuso do Brasil) — sem urgência de minuto exato, cobrança PIX não é
 * cronometrada ao segundo.
 */
export async function scheduleBillingRenewalJob(): Promise<void> {
  await getBillingRenewalQueue().add(
    "run",
    {},
    { repeat: { pattern: "0 3 * * *" }, jobId: "billing-renewal-daily" },
  );
}
