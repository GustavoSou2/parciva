/**
 * Estatística simples de atraso por pagador — DESIGN.md v6 §7.9: "base
 * é sempre estatística simples e visível (taxa de atraso histórico do
 * próprio pagador), nunca uma caixa-preta de score sem explicação ao
 * lado". Import direto de `@/db/schema/financial` (installments +
 * contracts) é o mesmo padrão já justificado em `dashboard/infra/
 * dashboard-repository.ts` — leitura agregada que atravessa o módulo de
 * contratos, não escrita.
 *
 * Versão simples, de propósito (DESIGN.md v6 §7.9 permite isso
 * explicitamente): conta parcela `overdue` AGORA, não "foi paga depois
 * do vencimento" — essa segunda métrica exigiria cruzar
 * `payment_allocations`/`payments.paid_at` contra `installments.due_date`
 * por alocação, perdendo a garantia de leitura de uma tabela só.
 * Reportado como próximo passo no CHANGELOG, não construído aqui.
 */

import { and, eq, lte, ne, sql } from "drizzle-orm";
import { getDb, type TenantContext } from "@/db/client";
import { contracts, installments } from "@/db/schema/financial";

export interface PayerDelinquencyStats {
  readonly payerId: string;
  /** Parcelas cujo vencimento já passou (exclui cancelada/baixada — essas nunca "venceram" de fato). */
  readonly dueInstallments: number;
  readonly overdueInstallments: number;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Uma linha por pagador com pelo menos uma parcela já vencida (em qualquer sentido) — pagador sem parcela vencida ainda simplesmente não aparece, o chamador trata a ausência como "0 de 0". */
export async function listPayerDelinquencyStats(ctx: TenantContext): Promise<PayerDelinquencyStats[]> {
  const today = todayISO();
  const rows = await getDb(ctx, (db) =>
    db
      .select({
        payerId: contracts.payerId,
        dueInstallments: sql<string>`count(*)`,
        overdueInstallments: sql<string>`count(*) filter (where ${installments.status} = 'overdue')`,
      })
      .from(installments)
      .innerJoin(contracts, eq(installments.contractId, contracts.id))
      .where(
        and(
          eq(contracts.tenantId, ctx.tenantId),
          lte(installments.dueDate, today),
          ne(installments.status, "cancelled"),
          ne(installments.status, "written_off"),
        ),
      )
      .groupBy(contracts.payerId),
  );
  return rows.map((row) => ({
    payerId: row.payerId,
    dueInstallments: Number(row.dueInstallments),
    overdueInstallments: Number(row.overdueInstallments),
  }));
}

export async function getPayerDelinquencyStats(
  ctx: TenantContext,
  payerId: string,
): Promise<PayerDelinquencyStats> {
  const today = todayISO();
  const rows = await getDb(ctx, (db) =>
    db
      .select({
        dueInstallments: sql<string>`count(*)`,
        overdueInstallments: sql<string>`count(*) filter (where ${installments.status} = 'overdue')`,
      })
      .from(installments)
      .innerJoin(contracts, eq(installments.contractId, contracts.id))
      .where(
        and(
          eq(contracts.tenantId, ctx.tenantId),
          eq(contracts.payerId, payerId),
          lte(installments.dueDate, today),
          ne(installments.status, "cancelled"),
          ne(installments.status, "written_off"),
        ),
      ),
  );
  const row = rows[0];
  return {
    payerId,
    dueInstallments: Number(row?.dueInstallments ?? 0),
    overdueInstallments: Number(row?.overdueInstallments ?? 0),
  };
}
