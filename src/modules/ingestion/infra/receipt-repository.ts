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

import { desc, eq, and, isNotNull } from "drizzle-orm";
import { getDb, type TenantContext } from "@/db/client";
import { receipts, receiptExtractions } from "@/db/schema/ingestion";
import { hammingDistance } from "../domain/normalizer";
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
  /** aHash de 64 bits (Tier 0, spec §7.1/C-02) — só para imagem; ausente para PDF. */
  readonly perceptualHash?: string;
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

/** `receipts` + a extração mais recente — o que a fila de revisão (Marco 5) precisa mostrar lado a lado com a proposta. */
export interface ReceiptWithExtraction {
  readonly id: string;
  readonly source: ReceiptSource;
  readonly storageKey: string;
  readonly mimeType: string;
  readonly status: ReceiptStatus;
  readonly receivedAt: Date;
  readonly extraction: ExtractionOutput | null;
}

export async function getReceiptWithExtraction(
  ctx: TenantContext,
  receiptId: string,
): Promise<ReceiptWithExtraction | null> {
  const receiptRows = await getDb(ctx, (db) =>
    db
      .select()
      .from(receipts)
      .where(and(eq(receipts.tenantId, ctx.tenantId), eq(receipts.id, receiptId)))
      .limit(1),
  );
  const receiptRow = receiptRows[0];
  if (!receiptRow) return null;

  const extractionRows = await getDb(ctx, (db) =>
    db
      .select({ data: receiptExtractions.data })
      .from(receiptExtractions)
      .where(
        and(eq(receiptExtractions.tenantId, ctx.tenantId), eq(receiptExtractions.receiptId, receiptId)),
      )
      .orderBy(desc(receiptExtractions.createdAt))
      .limit(1),
  );

  return {
    id: receiptRow.id,
    source: receiptRow.source,
    storageKey: receiptRow.storageKey,
    mimeType: receiptRow.mimeType,
    status: receiptRow.status,
    receivedAt: receiptRow.receivedAt,
    extraction: (extractionRows[0]?.data as ExtractionOutput | undefined) ?? null,
  };
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
      perceptualHash: data.perceptualHash ?? null,
      receivedAt: data.receivedAt,
    }),
  );
}

/** Janela de comparação para quase-duplicata — Hamming distance não é indexável no Postgres (comentário em findNearDuplicateByPerceptualHash). */
const NEAR_DUPLICATE_SCAN_WINDOW = 200;

/**
 * Reenvio "quase igual" (recorte/recompressão, spec §7.1/C-02) — como
 * distância de Hamming não é indexável no Postgres, isto busca as
 * `NEAR_DUPLICATE_SCAN_WINDOW` receipts mais recentes do tenant com
 * `perceptual_hash` preenchido e compara em memória. Não escala para
 * milhões de linhas por tenant, mas resolve o caso real (reenvio do MESMO
 * cliente numa janela curta) sem infraestrutura nova — revisitar se algum
 * dia o volume por tenant justificar um índice especializado.
 */
export async function findNearDuplicateByPerceptualHash(
  ctx: TenantContext,
  perceptualHash: string,
  maxDistance: number,
): Promise<boolean> {
  const rows = await getDb(ctx, (db) =>
    db
      .select({ perceptualHash: receipts.perceptualHash })
      .from(receipts)
      .where(and(eq(receipts.tenantId, ctx.tenantId), isNotNull(receipts.perceptualHash)))
      .orderBy(desc(receipts.receivedAt))
      .limit(NEAR_DUPLICATE_SCAN_WINDOW),
  );

  return rows.some(
    (row) => row.perceptualHash !== null && hammingDistance(perceptualHash, row.perceptualHash) <= maxDistance,
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
