/**
 * `ledger_entries` é append-only (CLAUDE.md invariante 2, trigger em
 * 0002_ledger_trigger.sql) — este arquivo nunca faz UPDATE/DELETE nela,
 * só INSERT. Duas formas de escrever, de propósito:
 *
 * - `writeEntry(ctx, data)`: abre sua própria transação via `getDb()`.
 *   Uso simples, standalone.
 * - `writeEntryTx(db, tenantId, data)`: recebe um `TenantDb` já aberto
 *   por quem chama. Existe para o caso real do módulo `reconciliation`:
 *   lançar no ledger precisa acontecer na MESMA transação que escreve
 *   `payments`/`payment_allocations`/`installments` (tudo ou nada, e o
 *   lock de `SELECT ... FOR UPDATE` em `installments` só vale enquanto a
 *   transação estiver aberta) — chamar `writeEntry` de novo abriria uma
 *   transação separada e perderia essa garantia.
 */

import { and, desc, eq } from "drizzle-orm";
import { getDb, type TenantContext, type TenantDb } from "@/db/client";
import { ledgerEntries } from "@/db/schema/financial";
import { money } from "@/shared/money";
import type { LedgerEntry, NewLedgerEntry } from "../domain/types";

function toEntry(row: typeof ledgerEntries.$inferSelect): LedgerEntry {
  return {
    id: row.id,
    sequence: row.sequence,
    entryType: row.entryType,
    payerId: row.payerId,
    contractId: row.contractId,
    installmentId: row.installmentId,
    paymentId: row.paymentId,
    amountCents: money(row.amountCents),
    direction: row.direction,
    reversesEntryId: row.reversesEntryId,
    actorType: row.actorType,
    actorId: row.actorId,
    ruleVersion: row.ruleVersion,
    payload: row.payload as Record<string, unknown>,
    createdAt: row.createdAt,
  };
}

export async function writeEntryTx(
  db: TenantDb,
  tenantId: string,
  data: NewLedgerEntry,
): Promise<LedgerEntry> {
  const [row] = await db
    .insert(ledgerEntries)
    .values({
      tenantId,
      entryType: data.entryType,
      payerId: data.payerId ?? null,
      contractId: data.contractId ?? null,
      installmentId: data.installmentId ?? null,
      paymentId: data.paymentId ?? null,
      amountCents: data.amountCents,
      direction: data.direction,
      reversesEntryId: data.reversesEntryId ?? null,
      actorType: data.actorType,
      actorId: data.actorId ?? null,
      ruleVersion: data.ruleVersion,
      payload: data.payload ?? {},
    })
    .returning();
  if (!row) throw new Error("Insert de ledger_entries não retornou linha — não deveria acontecer.");
  return toEntry(row);
}

export async function writeEntry(ctx: TenantContext, data: NewLedgerEntry): Promise<LedgerEntry> {
  return getDb(ctx, (db) => writeEntryTx(db, ctx.tenantId, data));
}

export async function listEntriesForPayment(
  ctx: TenantContext,
  paymentId: string,
): Promise<LedgerEntry[]> {
  const rows = await getDb(ctx, (db) =>
    db
      .select()
      .from(ledgerEntries)
      .where(and(eq(ledgerEntries.tenantId, ctx.tenantId), eq(ledgerEntries.paymentId, paymentId))),
  );
  return rows.map(toEntry);
}

/** "Histórico de lançamentos" do contrato — spec §14 Fase 1 (tela de detalhe do contrato). */
export async function listEntriesForContract(
  ctx: TenantContext,
  contractId: string,
): Promise<LedgerEntry[]> {
  const rows = await getDb(ctx, (db) =>
    db
      .select()
      .from(ledgerEntries)
      .where(and(eq(ledgerEntries.tenantId, ctx.tenantId), eq(ledgerEntries.contractId, contractId)))
      .orderBy(desc(ledgerEntries.createdAt)),
  );
  return rows.map(toEntry);
}
