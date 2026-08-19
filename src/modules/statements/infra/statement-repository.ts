/**
 * `statement_imports`/`statement_lines` — Fase 5 (fatia 2, spec §8.1
 * Camada D). `recordStatementImport` grava tudo numa transação: as
 * linhas já chegam com match resolvido (`application/import-statement.ts`
 * já consultou/atualizou `payments` via `@/modules/reconciliation` antes
 * de chamar isto) — este arquivo só persiste o resultado.
 */

import { and, desc, eq, sql } from "drizzle-orm";
import { getDb, type TenantContext } from "@/db/client";
import { statementImports, statementLines } from "@/db/schema/statements";
import { money } from "@/shared/money";
import type { NewStatementLine, StatementImportSummary, StatementLine } from "../domain/types";

function toStatementLine(row: typeof statementLines.$inferSelect): StatementLine {
  return {
    id: row.id,
    statementImportId: row.statementImportId,
    occurredAt: row.occurredAt,
    description: row.description,
    amountCents: money(row.amountCents),
    extractedRef: row.extractedRef,
    matchKind: row.matchKind,
    matchedPaymentId: row.matchedPaymentId,
    createdAt: row.createdAt,
  };
}

function toStatementImportSummary(row: typeof statementImports.$inferSelect): StatementImportSummary {
  return {
    id: row.id,
    filename: row.filename,
    lineCount: row.lineCount,
    matchedCount: row.matchedCount,
    createdAt: row.createdAt,
  };
}

export interface RecordStatementImportInput {
  readonly filename: string;
  readonly uploadedBy: string;
  readonly lines: readonly NewStatementLine[];
}

export async function recordStatementImport(
  ctx: TenantContext,
  input: RecordStatementImportInput,
): Promise<{ importId: string }> {
  const matchedCount = input.lines.filter((line) => line.matchKind !== null).length;

  return getDb(ctx, async (db) => {
    const [importRow] = await db
      .insert(statementImports)
      .values({
        tenantId: ctx.tenantId,
        filename: input.filename,
        uploadedBy: input.uploadedBy,
        lineCount: input.lines.length,
        matchedCount,
      })
      .returning({ id: statementImports.id });
    if (!importRow) throw new Error("Insert de statement_imports não retornou linha — não deveria acontecer.");

    if (input.lines.length > 0) {
      await db.insert(statementLines).values(
        input.lines.map((line) => ({
          tenantId: ctx.tenantId,
          statementImportId: importRow.id,
          occurredAt: line.occurredAt,
          description: line.description,
          amountCents: line.amountCents,
          extractedRef: line.extractedRef,
          matchKind: line.matchKind,
          matchedPaymentId: line.matchedPaymentId,
        })),
      );
    }

    return { importId: importRow.id };
  });
}

/** Mais recente primeiro — lista pra `/t/<slug>/statements`. */
export async function listStatementImports(ctx: TenantContext): Promise<StatementImportSummary[]> {
  const rows = await getDb(ctx, (db) =>
    db
      .select()
      .from(statementImports)
      .where(eq(statementImports.tenantId, ctx.tenantId))
      .orderBy(desc(statementImports.createdAt)),
  );
  return rows.map(toStatementImportSummary);
}

export async function getStatementImportById(
  ctx: TenantContext,
  importId: string,
): Promise<StatementImportSummary | null> {
  const rows = await getDb(ctx, (db) =>
    db
      .select()
      .from(statementImports)
      .where(and(eq(statementImports.tenantId, ctx.tenantId), eq(statementImports.id, importId)))
      .limit(1),
  );
  return rows[0] ? toStatementImportSummary(rows[0]) : null;
}

export async function getStatementLinesByImport(
  ctx: TenantContext,
  importId: string,
): Promise<StatementLine[]> {
  const rows = await getDb(ctx, (db) =>
    db
      .select()
      .from(statementLines)
      .where(and(eq(statementLines.tenantId, ctx.tenantId), eq(statementLines.statementImportId, importId))),
  );
  return rows.map(toStatementLine);
}

export async function getStatementLineById(
  ctx: TenantContext,
  lineId: string,
): Promise<StatementLine | null> {
  const rows = await getDb(ctx, (db) =>
    db
      .select()
      .from(statementLines)
      .where(and(eq(statementLines.tenantId, ctx.tenantId), eq(statementLines.id, lineId)))
      .limit(1),
  );
  return rows[0] ? toStatementLine(rows[0]) : null;
}

/** Chamado depois de `executeStatementPayment` ter sucesso (caminho manual) — marca a linha, incrementa `matched_count` do import. */
export async function markStatementLineMatched(
  ctx: TenantContext,
  lineId: string,
  paymentId: string,
): Promise<void> {
  await getDb(ctx, async (db) => {
    const [line] = await db
      .update(statementLines)
      .set({ matchKind: "manual", matchedPaymentId: paymentId })
      .where(and(eq(statementLines.tenantId, ctx.tenantId), eq(statementLines.id, lineId)))
      .returning({ statementImportId: statementLines.statementImportId });
    if (!line) return;

    await db
      .update(statementImports)
      .set({ matchedCount: sql`${statementImports.matchedCount} + 1` })
      .where(and(eq(statementImports.tenantId, ctx.tenantId), eq(statementImports.id, line.statementImportId)));
  });
}
