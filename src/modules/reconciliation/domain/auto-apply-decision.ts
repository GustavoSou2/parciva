/**
 * Decisão de auto-aplicação — spec §6.6, ramo `origin=receipt`. Puro:
 * nenhuma condição aqui consulta banco; tudo já chega calculado por
 * quem orquestra (`application/process-receipt-extraction.ts`).
 *
 * Risco/fraude (spec: "risk_score abaixo do limiar", "nenhum
 * fraud_check com resultado fail") é NO-OP documentado neste marco —
 * o módulo de fraude é da Fase 5 e não existe ainda. Isso simplifica
 * o invariante 5 do CLAUDE.md ("na dúvida, revisão humana"): as outras
 * condições abaixo continuam valendo de verdade, então nenhuma
 * auto-aplicação acontece sem confiança alta, identificação forte,
 * alocação exata e valor dentro do teto — só não há um sinal de risco
 * adicional para reforçar ainda mais a barreira. Decisão confirmada
 * com o usuário; ver PROGRESS.md/DECISIONS.md.
 *
 * Qualquer condição que falhe cai em `needs_review` — nunca em
 * `rejected` sozinho (spec: "nunca rejeitar automaticamente sem
 * revisão humana").
 */

import { isZero, type Money } from "@/shared/money";
import type { FieldConfidence } from "@/modules/ingestion";
import type { IdentificationTier } from "@/modules/payers";

export const CONFIDENCE_THRESHOLD = 0.9;
export const FIELD_CONFIDENCE_THRESHOLD = 0.85;
export const MAX_PAST_DAYS = 30;

export interface AutoApplyInput {
  readonly confidence: number;
  readonly fieldConfidence: FieldConfidence;
  readonly identificationTier: IdentificationTier | null;
  readonly remainingCents: Money;
  readonly paidAt: Date;
  readonly referenceDate: Date;
  readonly amountCents: Money;
  readonly ceilingCents: Money;
}

export type AutoApplyDecision = "auto_applied" | "needs_review";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function isPlausibleDate(paidAt: Date, referenceDate: Date): boolean {
  const diffMs = referenceDate.getTime() - paidAt.getTime();
  if (diffMs < 0) return false; // futuro
  return diffMs <= MAX_PAST_DAYS * MS_PER_DAY;
}

function hasWeakField(fieldConfidence: FieldConfidence): boolean {
  return Object.values(fieldConfidence).some((score) => score < FIELD_CONFIDENCE_THRESHOLD);
}

const STRONG_TIERS: ReadonlySet<IdentificationTier> = new Set(["phone", "document"]);

export function decideAutoApply(input: AutoApplyInput): AutoApplyDecision {
  if (input.confidence < CONFIDENCE_THRESHOLD) return "needs_review";
  if (hasWeakField(input.fieldConfidence)) return "needs_review";
  if (!input.identificationTier || !STRONG_TIERS.has(input.identificationTier)) return "needs_review";
  if (!isZero(input.remainingCents)) return "needs_review";
  if (!isPlausibleDate(input.paidAt, input.referenceDate)) return "needs_review";
  if (input.amountCents > input.ceilingCents) return "needs_review";

  return "auto_applied";
}
