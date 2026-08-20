/**
 * Tipos puros do Painel (spec §13.2 tela 1: "recebido hoje, a receber nos
 * próximos 7 dias, fila de revisão, taxa de automação"). Sem I/O.
 */

import type { Money } from "@/shared/money";

export interface UpcomingInstallmentSummary {
  readonly installmentId: string;
  readonly contractId: string;
  readonly payerName: string;
  readonly amountCents: Money;
  readonly dueDate: string;
}

/** Contagem de `reconciliation_proposals.decision` — base da taxa de automação. */
export interface ProposalDecisionCounts {
  readonly autoApplied: number;
  readonly needsReview: number;
  readonly rejected: number;
  readonly reviewedApproved: number;
}

/** Um ponto da série diária pro sparkline (§7.3) — dia sem pagamento entra com `ZERO`, nunca é omitido (senão o sparkline mostraria menos dias do que os pedidos). */
export interface DailyTotal {
  readonly date: string;
  readonly totalCents: Money;
}

/**
 * Card "Valor em risco" (DESIGN.md v6 §7.9) — versão SIMPLES de
 * propósito (permitida explicitamente pelo prompt da Rodada 6): soma
 * de parcelas `overdue` agora. A versão completa ("pagador
 * historicamente inadimplente") ficou de fora — ver nota em
 * `payer-risk-repository.ts` — e é reportada como próximo passo no
 * CHANGELOG, não bloqueia esta rodada.
 */
export interface AtRiskSummary {
  readonly amountCents: Money;
  readonly contractsCount: number;
  readonly payersCount: number;
}

export interface DashboardSummary {
  readonly receivedTodayCents: Money;
  readonly receivedYesterdayCents: Money;
  /** Últimos 14 dias, mais antigo primeiro — sparkline (§7.3) de "Recebido hoje". */
  readonly receivedDailySeries: readonly DailyTotal[];
  readonly upcoming7DaysCents: Money;
  readonly upcomingInstallments: readonly UpcomingInstallmentSummary[];
  readonly reviewQueueCount: number;
  /** Fração 0–1 de comprovantes que não precisaram de revisão humana, desde sempre; `null` sem nenhuma proposta decidida ainda. Alimenta o gauge (§7.1) — métrica vitalícia, não de janela. */
  readonly automationRate: number | null;
  /** Últimos 7 dias vs. os 7 dias antes — só pro selo de tendência (§7.5), nunca o gauge. */
  readonly automationRateCurrentWindow: number | null;
  readonly automationRatePreviousWindow: number | null;
  readonly atRisk: AtRiskSummary;
}

/**
 * `auto_applied / (auto_applied + needs_review + rejected + reviewed_approved)`
 * — "revisado e aprovado depois" ainda conta no denominador porque passou
 * pela fila (não foi automático), mas nunca no numerador.
 */
export function computeAutomationRate(counts: ProposalDecisionCounts): number | null {
  const total = counts.autoApplied + counts.needsReview + counts.rejected + counts.reviewedApproved;
  if (total === 0) return null;
  return counts.autoApplied / total;
}

export interface Trend {
  readonly direction: "up" | "down";
  /** Sempre positivo — a direção já está em `direction`, o percentual não repete o sinal. */
  readonly percent: number;
}

/**
 * Selo de tendência (DESIGN.md v6 §7.5) — "sempre relativo a um período
 * nomeado", nunca um percentual sem contexto. `null` quando não há
 * comparação com sentido: período anterior zero (variação percentual de
 * uma base zero não é um número, é indefinição) ou os dois valores
 * iguais (0% de variação não é tendência, é estabilidade — sem selo).
 */
export function computeTrend(current: number, previous: number): Trend | null {
  if (previous === 0 || current === previous) return null;
  return {
    direction: current > previous ? "up" : "down",
    percent: Math.abs(((current - previous) / previous) * 100),
  };
}
