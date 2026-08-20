/**
 * Tipos do módulo `fraud` — spec §8 (Camadas A/B/C). Camada A/B: 3
 * checks determinísticos (`amount_match`/`date_plausible`/`e2e_reuse`).
 * Camada C (comportamental, DECISIONS.md [35]): 4 checks probabilísticos
 * (`velocity`/`history`/`amount_pattern`/`phone_change`) que produzem
 * `warn`, nunca `fail` — ver README.md do módulo para o que ainda fica
 * de fora (Camada A/B forense).
 */

export type FraudCheckCode =
  | "amount_match"
  | "date_plausible"
  | "e2e_reuse"
  | "velocity"
  | "history"
  | "amount_pattern"
  | "phone_change";

/** `warn` é o resultado dos 4 checks de Camada C — indício estatístico, nunca prova (por isso nunca `fail`, nunca em `FORCES_REVIEW`). */
export type FraudCheckResult = "pass" | "warn" | "fail";

export interface FraudCheck {
  readonly code: FraudCheckCode;
  readonly result: FraudCheckResult;
  readonly weight: number;
  readonly detail: string | null;
}

export interface FraudSignals {
  readonly amountMatches: boolean;
  readonly datePlausible: boolean;
  readonly transactionRefReused: boolean;
  /** Camada C — já resolvidos por `fraud/domain/behavior.ts` a partir de agregados que o chamador buscou. */
  readonly velocityAnomaly: boolean;
  readonly newPayerAmountDisproportionate: boolean;
  readonly amountPatternSuspicious: boolean;
  readonly phoneChanged: boolean;
}

export interface FraudAssessment {
  readonly checks: readonly FraudCheck[];
  readonly riskScore: number;
  readonly blocksAutoApply: boolean;
}
