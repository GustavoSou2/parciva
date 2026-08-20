// porta pública do módulo — só o que está aqui pode ser importado de fora.
export {
  evaluateFraudChecks,
  CHECK_WEIGHTS,
  BEHAVIORAL_CHECK_WEIGHTS,
  BEHAVIORAL_MAX_CONTRIBUTION,
  DEFAULT_RISK_SCORE_THRESHOLD,
} from "./domain/evaluate";
export type {
  FraudAssessment,
  FraudCheck,
  FraudCheckCode,
  FraudCheckResult,
  FraudSignals,
} from "./domain/types";
export {
  detectVelocityAnomaly,
  detectDisproportionateNewPayerAmount,
  detectAmountPatternAnomaly,
  detectPhoneChange,
  VELOCITY_WINDOW_HOURS,
  AMOUNT_PATTERN_WINDOW_DAYS,
} from "./domain/behavior";
export type { PayerActivityCounts } from "./domain/behavior";
export { recordFraudChecksTx, listFraudChecksByReceipt } from "./infra/fraud-check-repository";
export {
  getPayerActivityCounts,
  getPayerAverageInstallmentCents,
  countDistinctPayersWithAmountRecently,
} from "./infra/behavior-repository";
