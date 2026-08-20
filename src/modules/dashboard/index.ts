// porta pública do módulo — só o que está aqui pode ser importado de fora.
export { getDashboardSummary } from "./infra/dashboard-repository";
export { computeAutomationRate, computeTrend } from "./domain/types";
export type {
  AtRiskSummary,
  DailyTotal,
  DashboardSummary,
  ProposalDecisionCounts,
  Trend,
  UpcomingInstallmentSummary,
} from "./domain/types";
