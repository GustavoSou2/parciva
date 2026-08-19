/**
 * Score de risco — spec §8.2: "risk_score = soma ponderada dos checks,
 * normalizada 0-100. Qualquer check fail de peso alto força revisão
 * independentemente do score — não existe compensação por outros checks
 * bons." `e2e_reuse` está em `FORCES_REVIEW` porque é do mesmo grupo que a
 * spec cita como exemplo (E2E_REUSE, DUPLICATE_HASH, PAYEE_MATCH — os
 * outros dois não são avaliados aqui, ver README.md) — a força vem de
 * pertencer a esse conjunto, não do peso numérico em si; por isso o peso
 * de `e2e_reuse` pode ser um número comum na soma, sem precisar dominar
 * o total pra "garantir" o bloqueio.
 *
 * Puro — sem I/O. Quem chama já resolveu os booleanos de `FraudSignals`
 * a partir do que a transação de `payment-repository.ts` já tinha em
 * mãos (nunca recalcula lógica que já existe em outro lugar).
 */

import type { FraudAssessment, FraudCheck, FraudCheckCode, FraudSignals } from "./types";

export const CHECK_WEIGHTS: Readonly<Record<FraudCheckCode, number>> = {
  amount_match: 50,
  date_plausible: 40,
  e2e_reuse: 60,
};

const FORCES_REVIEW: ReadonlySet<FraudCheckCode> = new Set(["e2e_reuse"]);

const TOTAL_WEIGHT = Object.values(CHECK_WEIGHTS).reduce((sum, weight) => sum + weight, 0);

/**
 * Limiar único nesta fatia — sem perfil por tenant ainda (spec §8.2 prevê
 * "conservador/equilibrado/permissivo" configurável, fora de escopo aqui;
 * mesma simplificação que `DEFAULT_AUTO_APPROVAL_CEILING_CENTS` teve antes
 * de virar setting de tenant).
 */
export const DEFAULT_RISK_SCORE_THRESHOLD = 50;

function buildCheck(code: FraudCheckCode, passed: boolean, detail: string | null): FraudCheck {
  return { code, result: passed ? "pass" : "fail", weight: CHECK_WEIGHTS[code], detail };
}

export function evaluateFraudChecks(signals: FraudSignals): FraudAssessment {
  const checks: FraudCheck[] = [
    buildCheck("amount_match", signals.amountMatches, signals.amountMatches ? null : "Valor não bate com o esperado"),
    buildCheck(
      "date_plausible",
      signals.datePlausible,
      signals.datePlausible ? null : "Data paga fora da janela plausível",
    ),
    buildCheck(
      "e2e_reuse",
      !signals.transactionRefReused,
      signals.transactionRefReused ? "Referência de transação já usada em outro pagamento" : null,
    ),
  ];

  const failedWeight = checks
    .filter((check) => check.result === "fail")
    .reduce((sum, check) => sum + check.weight, 0);
  const riskScore = TOTAL_WEIGHT > 0 ? (100 * failedWeight) / TOTAL_WEIGHT : 0;

  const forcedFail = checks.some((check) => check.result === "fail" && FORCES_REVIEW.has(check.code));
  const blocksAutoApply = forcedFail || riskScore > DEFAULT_RISK_SCORE_THRESHOLD;

  return { checks, riskScore, blocksAutoApply };
}
