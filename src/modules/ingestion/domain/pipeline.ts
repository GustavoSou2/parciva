/**
 * Orquestração pura da cascata de tiers — spec §7.1. Sem I/O: recebe o
 * que cada tier já produziu e decide como mesclar; decidir QUANDO rodar
 * cada tier (custo, confiança mínima, disponibilidade de VLM) é
 * responsabilidade de `application/ingest-receipt.ts`.
 */

import type { Result } from "@/shared/result";
import { err, ok } from "@/shared/result";
import type { ExtractionOutput, ExtractionTier, FieldConfidence } from "./types";

export interface ExtractionTierContribution {
  readonly tier: ExtractionTier;
  readonly output: Partial<ExtractionOutput>;
}

/** `is_payment_receipt: false` em qualquer tier encerra o pipeline (spec §7.1). */
export type MergeError = "not_a_receipt";

/** Ordem da cascata (spec §7.1) — menor rank = mais confiável = maior precedência. */
const TIER_RANK: Record<ExtractionTier, number> = {
  cache: 0,
  deterministic: 1,
  ocr: 2,
  vlm_cheap: 3,
  vlm_premium: 4,
  human: 5,
};

const DETERMINISTIC_WEIGHT = 2;
const PROBABILISTIC_WEIGHT = 1;

function weightOf(tier: ExtractionTier): number {
  return tier === "cache" || tier === "deterministic" ? DETERMINISTIC_WEIGHT : PROBABILISTIC_WEIGHT;
}

/**
 * Confiança assumida para um tier que contribuiu campos mas não reportou
 * `confidence` explícito. Tiers determinísticos, OCR e revisão humana são
 * certos por construção (regex bateu ou humano decidiu — não há
 * meio-termo probabilístico a expressar); `ocr` roda o mesmo
 * `extractFromText` do Tier 1, só que sobre texto vindo do
 * reconhecimento de imagem — o ruído do OCR se manifesta como o regex
 * NÃO bater (ausência), nunca como um valor incorreto com confiança
 * parcial, então o mesmo raciocínio de "certo por construção" vale
 * aqui. Tiers de VLM sem `confidence` explícito não entram na média —
 * não há base para assumir nada sobre eles.
 */
function impliedConfidence(tier: ExtractionTier): number | undefined {
  return tier === "cache" || tier === "deterministic" || tier === "ocr" || tier === "human"
    ? 1
    : undefined;
}

type CriticalField = "amount_cents" | "paid_at" | "transaction_ref";

/** Penalidade de confiança por campo crítico divergente — spec §7.1: nunca escolher valor arbitrário. */
const DIVERGENCE_PENALTY_PER_FIELD = 0.3;

/**
 * `null` explícito ("o extrator olhou e concluiu que não dá para saber",
 * types.ts) conta como ausência para efeito de merge — não sobrescreve,
 * não concorre por divergência e não vence quando outro tier tem um
 * valor concreto. Só `undefined` (chave nem presente) e `null` recebem
 * esse tratamento igual; um valor concreto sempre é o que importa aqui.
 */
function hasOwn<K extends keyof ExtractionOutput>(
  output: Partial<ExtractionOutput>,
  field: K,
): output is Partial<ExtractionOutput> & Record<K, NonNullable<ExtractionOutput[K]>> {
  const value = output[field];
  return value !== undefined && value !== null;
}

/** Primeiro tier (em ordem de rank) que define o campo vence — ausência não sobrescreve presença. */
function firstPresent<K extends keyof ExtractionOutput>(
  sortedAscending: readonly ExtractionTierContribution[],
  field: K,
): ExtractionOutput[K] | null {
  for (const { output } of sortedAscending) {
    if (hasOwn(output, field)) return output[field];
  }
  return null;
}

function dedupe<T>(values: readonly T[]): T[] {
  const out: T[] = [];
  for (const value of values) {
    if (!out.includes(value)) out.push(value);
  }
  return out;
}

interface CriticalFieldResolution<T> {
  readonly value: T | null;
  readonly anomaly: string | null;
}

/**
 * Um campo crítico com valores concretos divergentes entre tiers nunca
 * escolhe um deles arbitrariamente (spec §7.1) — fica `null` e a
 * divergência vira uma entrada em `anomalies`. Função genérica em `K`
 * (não um loop indexando um objeto por chave dinâmica) para que o
 * compilador confirme, por instanciação, que o tipo de retorno casa com
 * o campo específico pedido em cada chamada.
 */
function resolveCriticalField<K extends CriticalField>(
  sortedAscending: readonly ExtractionTierContribution[],
  field: K,
): CriticalFieldResolution<NonNullable<ExtractionOutput[K]>> {
  const values = sortedAscending.filter(({ output }) => hasOwn(output, field)).map(({ output }) => output[field]);
  const distinct = dedupe(values);

  if (distinct.length > 1) {
    return {
      value: null,
      anomaly: `Divergência em ${field} entre tiers: ${distinct.join(" vs ")} — campo zerado, requer revisão.`,
    };
  }
  return { value: distinct[0] ?? null, anomaly: null };
}

/**
 * Mescla os fragmentos produzidos por cada tier da cascata num
 * `ExtractionOutput` completo (spec §7.1):
 *
 * - Tier mais baixo (mais confiável) tem precedência por campo.
 * - Campo ausente num tier não sobrescreve campo presente num tier anterior.
 * - `is_payment_receipt: false` em qualquer tier encerra com `Err` imediatamente.
 * - Campo crítico (`amount_cents`, `paid_at`, `transaction_ref`) com valores
 *   divergentes entre tiers fica `null` e gera uma entrada em `anomalies` —
 *   nunca escolhe um valor arbitrariamente.
 * - `confidence` final é a média ponderada dos tiers que contribuíram
 *   (peso maior para os tiers determinísticos 0 e 1), penalizada por
 *   divergência em campo crítico.
 */
export function mergeExtractions(
  tiers: readonly ExtractionTierContribution[],
): Result<ExtractionOutput, MergeError> {
  if (tiers.some(({ output }) => output.is_payment_receipt === false)) {
    return err("not_a_receipt");
  }

  const sorted = [...tiers].sort((a, b) => TIER_RANK[a.tier] - TIER_RANK[b.tier]);
  const contributing = sorted.filter(({ output }) => Object.keys(output).length > 0);

  const anomalies: string[] = [];
  for (const { output } of sorted) anomalies.push(...(output.anomalies ?? []));

  const amountCents = resolveCriticalField(sorted, "amount_cents");
  const paidAt = resolveCriticalField(sorted, "paid_at");
  const transactionRef = resolveCriticalField(sorted, "transaction_ref");
  const criticalResolutions = [amountCents, paidAt, transactionRef];

  let criticalDivergences = 0;
  for (const resolution of criticalResolutions) {
    if (resolution.anomaly) {
      criticalDivergences += 1;
      anomalies.push(resolution.anomaly);
    }
  }

  const field_confidence: FieldConfidence = {};
  for (const { output } of sorted) {
    for (const [key, value] of Object.entries(output.field_confidence ?? {})) {
      if (!(key in field_confidence)) field_confidence[key] = value;
    }
  }

  let totalWeight = 0;
  let weightedSum = 0;
  for (const { tier, output } of contributing) {
    const confidence = output.confidence ?? impliedConfidence(tier);
    if (confidence === undefined) continue;
    const weight = weightOf(tier);
    totalWeight += weight;
    weightedSum += weight * confidence;
  }
  const base = totalWeight > 0 ? weightedSum / totalWeight : 0;
  const penalty = 1 - DIVERGENCE_PENALTY_PER_FIELD * criticalDivergences;
  const confidence = Math.max(0, Math.min(1, base * penalty));

  return ok({
    is_payment_receipt: firstPresent(sorted, "is_payment_receipt") ?? true,
    method: firstPresent(sorted, "method") ?? "unknown",
    amount_cents: amountCents.value,
    paid_at: paidAt.value,
    transaction_ref: transactionRef.value,
    payer_name: firstPresent(sorted, "payer_name"),
    payer_document_masked: firstPresent(sorted, "payer_document_masked"),
    payee_name: firstPresent(sorted, "payee_name"),
    payee_document_masked: firstPresent(sorted, "payee_document_masked"),
    institution: firstPresent(sorted, "institution"),
    confidence,
    field_confidence,
    anomalies,
  });
}
