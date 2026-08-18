/**
 * Primeiro repositório real do projeto (nenhum módulo tocava o banco de
 * verdade antes desta tarefa) — persistência de `receipts` e
 * `receipt_extractions` (spec §5.3). Sempre via `getDb(ctx, ...)`
 * (invariante 3): nunca cliente cru, nunca sem TenantContext.
 *
 * `receiptExistsByHash` é um check "soft" (SELECT, não claim atômico):
 * seguro porque o worker roda com `concurrency: 1` (DECISIONS.md [10]),
 * então não há dois jobs concorrentes checando o mesmo hash ao mesmo
 * tempo. A garantia dura de verdade é a unique key
 * `(tenant_id, content_hash)` no banco — `createReceipt` propaga
 * violação dela como o erro "duplicate", nunca a engole.
 */

import { eq, and } from "drizzle-orm";
import { getDb, type TenantContext } from "@/db/client";
import { receipts, receiptExtractions } from "@/db/schema/ingestion";
import type { ExtractionOutput, ExtractionTier, FieldConfidence, ReceiptSource } from "../domain/types";

export type ReceiptStatus =
  | "received"
  | "processing"
  | "extracted"
  | "matched"
  | "applied"
  | "review"
  | "rejected"
  | "failed";

export interface NewReceipt {
  readonly id: string;
  readonly source: ReceiptSource;
  readonly storageKey: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly contentHash: string;
  readonly receivedAt: Date;
}

export interface NewReceiptExtraction {
  readonly receiptId: string;
  readonly tier: ExtractionTier;
  readonly data: ExtractionOutput;
  readonly fieldConfidence: FieldConfidence;
  readonly overallConfidence: number;
  readonly provider?: string;
  readonly model?: string;
  readonly latencyMs?: number;
  readonly error?: string;
}

export async function receiptExistsByHash(ctx: TenantContext, contentHash: string): Promise<boolean> {
  const rows = await getDb(ctx, (db) =>
    db
      .select({ id: receipts.id })
      .from(receipts)
      .where(and(eq(receipts.tenantId, ctx.tenantId), eq(receipts.contentHash, contentHash)))
      .limit(1),
  );
  return rows.length > 0;
}

export async function createReceipt(ctx: TenantContext, data: NewReceipt): Promise<void> {
  await getDb(ctx, (db) =>
    db.insert(receipts).values({
      id: data.id,
      tenantId: ctx.tenantId,
      source: data.source,
      storageKey: data.storageKey,
      mimeType: data.mimeType,
      sizeBytes: data.sizeBytes,
      contentHash: data.contentHash,
      receivedAt: data.receivedAt,
    }),
  );
}

export async function updateReceiptStatus(
  ctx: TenantContext,
  receiptId: string,
  status: ReceiptStatus,
  processedAt: Date = new Date(),
): Promise<void> {
  await getDb(ctx, (db) =>
    db
      .update(receipts)
      .set({ status, processedAt })
      .where(and(eq(receipts.tenantId, ctx.tenantId), eq(receipts.id, receiptId))),
  );
}

export async function saveExtraction(ctx: TenantContext, data: NewReceiptExtraction): Promise<void> {
  await getDb(ctx, (db) =>
    db.insert(receiptExtractions).values({
      tenantId: ctx.tenantId,
      receiptId: data.receiptId,
      tier: data.tier,
      provider: data.provider ?? null,
      model: data.model ?? null,
      data: data.data,
      fieldConfidence: data.fieldConfidence,
      overallConfidence: data.overallConfidence.toString(),
      latencyMs: data.latencyMs ?? null,
      error: data.error ?? null,
    }),
  );
}
