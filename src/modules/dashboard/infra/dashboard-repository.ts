/**
 * Painel (spec §13.2 tela 1) — só leitura, sem transação própria (nenhuma
 * escrita, nenhum lock precisa ser mantido entre as consultas). Import
 * direto de `@/db/schema/financial` é o mesmo padrão já justificado em
 * `reconciliation/infra/payment-repository.ts`: uma consulta que atravessa
 * várias tabelas (installments/payments/reconciliation_proposals/payers)
 * é a exceção que evita duplicar a leitura em cada módulo dono.
 */

import { and, between, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { getDb, type TenantContext, type TenantDb } from "@/db/client";
import { contracts, installments, payers, payments, reconciliationProposals } from "@/db/schema/financial";
import { money, ZERO } from "@/shared/money";
import type {
  AtRiskSummary,
  DailyTotal,
  DashboardSummary,
  ProposalDecisionCounts,
  UpcomingInstallmentSummary,
} from "../domain/types";
import { computeAutomationRate } from "../domain/types";

const UPCOMING_WINDOW_DAYS = 7;
const UPCOMING_LIST_LIMIT = 5;
const SPARKLINE_DAYS = 14;
const TREND_WINDOW_DAYS = 7;

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDaysISO(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function startOfDayUTC(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`);
}

const OPEN_INSTALLMENT_STATUSES: ("pending" | "partial")[] = ["pending", "partial"];

/** Soma `payments.amount_cents` aplicados dentro de `[start, end)` — mesma consulta usada pra "hoje"/"ontem", extraída pra não duplicar o `where`. */
async function sumAppliedPayments(
  db: TenantDb,
  tenantId: string,
  start: Date,
  end: Date,
): Promise<number> {
  const rows = await db
    .select({ total: sql<string>`coalesce(sum(${payments.amountCents}), 0)` })
    .from(payments)
    .where(
      and(
        eq(payments.tenantId, tenantId),
        eq(payments.status, "applied"),
        gte(payments.paidAt, start),
        lt(payments.paidAt, end),
      ),
    );
  return Number(rows[0]?.total ?? 0);
}

/** Contagem de `reconciliation_proposals.decision` dentro de `[start, end)` por `created_at` — base do selo de tendência da taxa de automação (janela, não vitalício). */
async function decisionCountsInRange(
  db: TenantDb,
  tenantId: string,
  start: Date,
  end: Date,
): Promise<ProposalDecisionCounts> {
  const rows = await db
    .select({ decision: reconciliationProposals.decision, count: sql<string>`count(*)` })
    .from(reconciliationProposals)
    .where(
      and(
        eq(reconciliationProposals.tenantId, tenantId),
        gte(reconciliationProposals.createdAt, start),
        lt(reconciliationProposals.createdAt, end),
      ),
    )
    .groupBy(reconciliationProposals.decision);

  let autoApplied = 0;
  let needsReview = 0;
  let rejected = 0;
  let reviewedApproved = 0;
  for (const row of rows) {
    const count = Number(row.count);
    if (row.decision === "auto_applied") autoApplied = count;
    else if (row.decision === "needs_review") needsReview = count;
    else if (row.decision === "rejected") rejected = count;
    else if (row.decision === "reviewed_approved") reviewedApproved = count;
  }
  return { autoApplied, needsReview, rejected, reviewedApproved };
}

export async function getDashboardSummary(ctx: TenantContext): Promise<DashboardSummary> {
  const today = todayISO();
  const windowEnd = addDaysISO(today, UPCOMING_WINDOW_DAYS);
  const tomorrow = addDaysISO(today, 1);
  const yesterday = addDaysISO(today, -1);
  const sparklineStart = addDaysISO(today, -(SPARKLINE_DAYS - 1));
  const trendCurrentStart = addDaysISO(today, -TREND_WINDOW_DAYS);
  const trendPreviousStart = addDaysISO(today, -TREND_WINDOW_DAYS * 2);

  const [
    receivedTodayCents,
    receivedYesterdayCents,
    dailyRows,
    upcomingRows,
    lifetimeDecisionCounts,
    automationRateCurrentWindowCounts,
    automationRatePreviousWindowCounts,
    atRiskRows,
  ] = await getDb(ctx, (db) =>
    Promise.all([
      sumAppliedPayments(db, ctx.tenantId, startOfDayUTC(today), startOfDayUTC(tomorrow)),
      sumAppliedPayments(db, ctx.tenantId, startOfDayUTC(yesterday), startOfDayUTC(today)),
      // Série diária pro sparkline (§7.3) — dias sem pagamento não geram
      // linha no GROUP BY; preenchidos com ZERO abaixo, nunca omitidos.
      db
        .select({
          day: sql<string>`(${payments.paidAt} at time zone 'UTC')::date`,
          total: sql<string>`coalesce(sum(${payments.amountCents}), 0)`,
        })
        .from(payments)
        .where(
          and(
            eq(payments.tenantId, ctx.tenantId),
            eq(payments.status, "applied"),
            gte(payments.paidAt, startOfDayUTC(sparklineStart)),
            lt(payments.paidAt, startOfDayUTC(tomorrow)),
          ),
        )
        .groupBy(sql`(${payments.paidAt} at time zone 'UTC')::date`),
      db
        .select({
          installmentId: installments.id,
          contractId: installments.contractId,
          payerName: payers.name,
          amountCents: installments.amountCents,
          paidCents: installments.paidCents,
          dueDate: installments.dueDate,
        })
        .from(installments)
        .innerJoin(contracts, eq(installments.contractId, contracts.id))
        .innerJoin(payers, eq(contracts.payerId, payers.id))
        .where(
          and(
            eq(installments.tenantId, ctx.tenantId),
            inArray(installments.status, OPEN_INSTALLMENT_STATUSES),
            between(installments.dueDate, today, windowEnd),
          ),
        )
        .orderBy(installments.dueDate),
      decisionCountsInRange(db, ctx.tenantId, new Date(0), startOfDayUTC(tomorrow)),
      decisionCountsInRange(db, ctx.tenantId, startOfDayUTC(trendCurrentStart), startOfDayUTC(tomorrow)),
      decisionCountsInRange(
        db,
        ctx.tenantId,
        startOfDayUTC(trendPreviousStart),
        startOfDayUTC(trendCurrentStart),
      ),
      // "Valor em risco" (DESIGN.md v6 §7.9) — versão SIMPLES de propósito
      // (permitida pelo prompt da Rodada 6): soma de parcelas `overdue`
      // agora. Versão completa ("pagador historicamente inadimplente")
      // reportada como próximo passo no CHANGELOG, não construída aqui.
      db
        .select({
          amount: sql<string>`coalesce(sum(${installments.amountCents} - ${installments.paidCents}), 0)`,
          contracts: sql<string>`count(distinct ${installments.contractId})`,
          payersCount: sql<string>`count(distinct ${contracts.payerId})`,
        })
        .from(installments)
        .innerJoin(contracts, eq(installments.contractId, contracts.id))
        .where(and(eq(installments.tenantId, ctx.tenantId), eq(installments.status, "overdue"))),
    ]),
  );

  const upcomingInstallments: UpcomingInstallmentSummary[] = upcomingRows.map((row) => ({
    installmentId: row.installmentId,
    contractId: row.contractId,
    payerName: row.payerName,
    amountCents: money(row.amountCents - row.paidCents),
    dueDate: row.dueDate,
  }));

  const upcoming7DaysCents = upcomingInstallments.reduce(
    (acc, item) => money(acc + item.amountCents),
    ZERO,
  );

  const dailyTotals = new Map(dailyRows.map((row) => [row.day, Number(row.total)]));
  const receivedDailySeries: DailyTotal[] = [];
  for (let i = 0; i < SPARKLINE_DAYS; i++) {
    const date = addDaysISO(sparklineStart, i);
    receivedDailySeries.push({ date, totalCents: money(dailyTotals.get(date) ?? 0) });
  }

  const atRiskRow = atRiskRows[0];
  const atRisk: AtRiskSummary = {
    amountCents: money(Number(atRiskRow?.amount ?? 0)),
    contractsCount: Number(atRiskRow?.contracts ?? 0),
    payersCount: Number(atRiskRow?.payersCount ?? 0),
  };

  return {
    receivedTodayCents: money(receivedTodayCents),
    receivedYesterdayCents: money(receivedYesterdayCents),
    receivedDailySeries,
    upcoming7DaysCents,
    upcomingInstallments: upcomingInstallments.slice(0, UPCOMING_LIST_LIMIT),
    reviewQueueCount: lifetimeDecisionCounts.needsReview,
    automationRate: computeAutomationRate(lifetimeDecisionCounts),
    automationRateCurrentWindow: computeAutomationRate(automationRateCurrentWindowCounts),
    automationRatePreviousWindow: computeAutomationRate(automationRatePreviousWindowCounts),
    atRisk,
  };
}
