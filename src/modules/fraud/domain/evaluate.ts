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
 * Camada C (comportamental, DECISIONS.md [35]) soma ao score via
 * `result: "warn"`, nunca `"fail"` — `FORCES_REVIEW` só olha `"fail"`,
 * então nenhum dos 4 checks novos força revisão sozinho, por construção,
 * sem precisar de guarda adicional. Camada C também NÃO entra no mesmo
 * pool de peso de Camada A/B: diluir `TOTAL_WEIGHT` com os pesos novos
 * mudaria silenciosamente o comportamento de score dos 3 checks
 * originais (ex.: `amount_match` + `date_plausible` falhando juntos
 * hoje ultrapassa o limiar sozinho — misturar os pools quebraria isso).
 * Em vez disso, Camada C contribui um incremento LIMITADO e ADITIVO
 * (`BEHAVIORAL_MAX_CONTRIBUTION`, normalizado dentro do próprio pool de
 * pesos comportamentais) — Camada A/B nunca muda de comportamento com a
 * chegada de mais checks probabilísticos no futuro (Camada B forense
 * deve seguir o mesmo padrão quando existir).
 *
 * Puro — sem I/O. Quem chama já resolveu os booleanos de `FraudSignals`
 * a partir do que a transação de `payment-repository.ts` já tinha em
 * mãos (nunca recalcula lógica que já existe em outro lugar).
 */

import type { FraudAssessment, FraudCheck, FraudCheckCode, FraudSignals } from "./types";

/** Camada A/B — determinísticos, pool de peso original, inalterado desde a fatia 1. */
export const CHECK_WEIGHTS: Readonly<Record<"amount_match" | "date_plausible" | "e2e_reuse", number>> = {
  amount_match: 50,
  date_plausible: 40,
  e2e_reuse: 60,
};

/** Camada C — probabilísticos, pool de peso próprio (relativo entre si, não na mesma escala de `CHECK_WEIGHTS`). */
export const BEHAVIORAL_CHECK_WEIGHTS: Readonly<
  Record<"velocity" | "history" | "amount_pattern" | "phone_change", number>
> = {
  velocity: 20,
  history: 15,
  amount_pattern: 20,
  phone_change: 30,
};

/** Quantos pontos (de 0-100) Camada C pode somar ao score no máximo, mesmo com os 4 checks disparando juntos — sempre abaixo de `DEFAULT_RISK_SCORE_THRESHOLD`, então nunca bloqueia sozinha. */
export const BEHAVIORAL_MAX_CONTRIBUTION = 30;

const FORCES_REVIEW: ReadonlySet<FraudCheckCode> = new Set(["e2e_reuse"]);

const TOTAL_WEIGHT = Object.values(CHECK_WEIGHTS).reduce((sum, weight) => sum + weight, 0);
const BEHAVIORAL_TOTAL_WEIGHT = Object.values(BEHAVIORAL_CHECK_WEIGHTS).reduce((sum, weight) => sum + weight, 0);

/**
 * Limiar único nesta fatia — sem perfil por tenant ainda (spec §8.2 prevê
 * "conservador/equilibrado/permissivo" configurável, fora de escopo aqui;
 * mesma simplificação que `DEFAULT_AUTO_APPROVAL_CEILING_CENTS` teve antes
 * de virar setting de tenant).
 */
export const DEFAULT_RISK_SCORE_THRESHOLD = 50;

function buildCheck(
  code: "amount_match" | "date_plausible" | "e2e_reuse",
  passed: boolean,
  detail: string | null,
): FraudCheck {
  return { code, result: passed ? "pass" : "fail", weight: CHECK_WEIGHTS[code], detail };
}

/** Camada C — dispara vira `"warn"` (indício, não prova), nunca `"fail"`. */
function buildWarnCheck(
  code: "velocity" | "history" | "amount_pattern" | "phone_change",
  triggered: boolean,
  detail: string | null,
): FraudCheck {
  return { code, result: triggered ? "warn" : "pass", weight: BEHAVIORAL_CHECK_WEIGHTS[code], detail };
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
    buildWarnCheck(
      "velocity",
      signals.velocityAnomaly,
      signals.velocityAnomaly ? "Volume de comprovantes acima do padrão histórico do pagador" : null,
    ),
    buildWarnCheck(
      "history",
      signals.newPayerAmountDisproportionate,
      signals.newPayerAmountDisproportionate
        ? "Pagador sem histórico enviando valor desproporcional ao perfil dos contratos"
        : null,
    ),
    buildWarnCheck(
      "amount_pattern",
      signals.amountPatternSuspicious,
      signals.amountPatternSuspicious ? "Mesmo valor exato reaproveitado entre pagadores diferentes" : null,
    ),
    buildWarnCheck(
      "phone_change",
      signals.phoneChanged,
      signals.phoneChanged ? "Telefone de origem diferente do cadastrado para este pagador" : null,
    ),
  ];

  const failedWeight = checks
    .filter((check) => check.result === "fail")
    .reduce((sum, check) => sum + check.weight, 0);
  const abScore = TOTAL_WEIGHT > 0 ? (100 * failedWeight) / TOTAL_WEIGHT : 0;

  const warnWeight = checks
    .filter((check) => check.result === "warn")
    .reduce((sum, check) => sum + check.weight, 0);
  const behavioralScore =
    BEHAVIORAL_TOTAL_WEIGHT > 0 ? (BEHAVIORAL_MAX_CONTRIBUTION * warnWeight) / BEHAVIORAL_TOTAL_WEIGHT : 0;

  const riskScore = Math.min(100, abScore + behavioralScore);

  const forcedFail = checks.some((check) => check.result === "fail" && FORCES_REVIEW.has(check.code));
  const blocksAutoApply = forcedFail || riskScore > DEFAULT_RISK_SCORE_THRESHOLD;

  return { checks, riskScore, blocksAutoApply };
}
