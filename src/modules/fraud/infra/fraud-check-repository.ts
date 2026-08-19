/**
 * `fraud_checks` — mesmo padrão de duas formas de escrever de
 * `ledger/infra/ledger-repository.ts`: `recordFraudChecksTx` recebe um
 * `TenantDb` já aberto por `reconciliation/infra/payment-repository.ts`
 * (precisa acontecer na MESMA transação que decide/aplica o pagamento,
 * nunca uma transação separada).
 */

import { and, eq } from "drizzle-orm";
import { getDb, type TenantContext, type TenantDb } from "@/db/client";
import { fraudChecks } from "@/db/schema/financial";
import type { FraudCheck } from "../domain/types";

function toFraudCheck(row: typeof fraudChecks.$inferSelect): FraudCheck {
  return {
    code: row.checkCode as FraudCheck["code"],
    result: row.result,
    weight: Number(row.weight),
    detail: (row.detail as string | null) ?? null,
  };
}

export async function recordFraudChecksTx(
  db: TenantDb,
  tenantId: string,
  receiptId: string,
  checks: readonly FraudCheck[],
): Promise<void> {
  if (checks.length === 0) return;
  await db.insert(fraudChecks).values(
    checks.map((check) => ({
      tenantId,
      receiptId,
      checkCode: check.code,
      result: check.result,
      weight: check.weight.toString(),
      detail: check.detail,
    })),
  );
}

/** Usado por `/t/<slug>/review/<id>` — mostra ao revisor humano por que o motor pontuou risco. */
export async function listFraudChecksByReceipt(
  ctx: TenantContext,
  receiptId: string,
): Promise<FraudCheck[]> {
  const rows = await getDb(ctx, (db) =>
    db
      .select()
      .from(fraudChecks)
      .where(and(eq(fraudChecks.tenantId, ctx.tenantId), eq(fraudChecks.receiptId, receiptId))),
  );
  return rows.map(toFraudCheck);
}
