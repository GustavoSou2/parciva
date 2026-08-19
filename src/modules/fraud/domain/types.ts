/**
 * Tipos do módulo `fraud` — spec §8 (Camadas A/B). Só os 3 checks já
 * detectáveis com o que o resto do código já calcula nesta fatia; ver
 * README.md do módulo para o que fica de fora.
 */

export type FraudCheckCode = "amount_match" | "date_plausible" | "e2e_reuse";

/** `warn` existe no enum do banco (spec §5.2) para os checks probabilísticos que ainda não existem (Camada C) — nenhum dos 3 checks desta fatia produz `warn`. */
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
}

export interface FraudAssessment {
  readonly checks: readonly FraudCheck[];
  readonly riskScore: number;
  readonly blocksAutoApply: boolean;
}
