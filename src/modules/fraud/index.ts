// porta pública do módulo — só o que está aqui pode ser importado de fora.
export { evaluateFraudChecks, CHECK_WEIGHTS, DEFAULT_RISK_SCORE_THRESHOLD } from "./domain/evaluate";
export type {
  FraudAssessment,
  FraudCheck,
  FraudCheckCode,
  FraudCheckResult,
  FraudSignals,
} from "./domain/types";
export { recordFraudChecksTx, listFraudChecksByReceipt } from "./infra/fraud-check-repository";
