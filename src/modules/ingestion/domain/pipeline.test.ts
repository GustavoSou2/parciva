import { describe, expect, it } from "vitest";
import { isErr, isOk } from "@/shared/result";
import { money } from "@/shared/money";
import { mergeExtractions } from "./pipeline";
import type { ExtractionTierContribution } from "./pipeline";

const E2E_ID = "E18236120202608121430ABC123DEF45";

describe("mergeExtractions — valor confirmado entre tiers", () => {
  it("tier determinístico extrai valor, VLM confirma → valor do determinístico prevalece", () => {
    const tiers: ExtractionTierContribution[] = [
      { tier: "deterministic", output: { amount_cents: money(150000) } },
      { tier: "vlm_cheap", output: { amount_cents: money(150000), confidence: 0.9 } },
    ];

    const result = mergeExtractions(tiers);

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.amount_cents).toBe(money(150000));
      expect(result.value.anomalies).toEqual([]);
    }
  });
});

describe("mergeExtractions — divergência em campo crítico", () => {
  it("tier determinístico extrai valor, VLM diverge → campo fica null e gera anomaly", () => {
    const tiers: ExtractionTierContribution[] = [
      { tier: "deterministic", output: { amount_cents: money(150000) } },
      { tier: "vlm_cheap", output: { amount_cents: money(150500), confidence: 0.9 } },
    ];

    const result = mergeExtractions(tiers);

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.amount_cents).toBeNull();
      expect(result.value.anomalies.some((a) => a.includes("amount_cents"))).toBe(true);
    }
  });
});

describe("mergeExtractions — is_payment_receipt: false", () => {
  it("encerra o pipeline com Err imediatamente", () => {
    const tiers: ExtractionTierContribution[] = [
      { tier: "vlm_cheap", output: { is_payment_receipt: false, confidence: 0.95 } },
    ];

    const result = mergeExtractions(tiers);

    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error).toBe("not_a_receipt");
  });

  it("encerra mesmo quando um tier de rank mais baixo já disse que era comprovante", () => {
    const tiers: ExtractionTierContribution[] = [
      { tier: "deterministic", output: { is_payment_receipt: true } },
      { tier: "vlm_premium", output: { is_payment_receipt: false } },
    ];

    expect(isErr(mergeExtractions(tiers))).toBe(true);
  });
});

describe("mergeExtractions — campo ausente preenchido por tier posterior", () => {
  it("Tier 1 sem payer_name, Tier 3 preenche → aceito", () => {
    const tiers: ExtractionTierContribution[] = [
      { tier: "deterministic", output: { transaction_ref: E2E_ID } },
      { tier: "vlm_cheap", output: { payer_name: "Fulano de Tal", confidence: 0.9 } },
    ];

    const result = mergeExtractions(tiers);

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.payer_name).toBe("Fulano de Tal");
      expect(result.value.transaction_ref).toBe(E2E_ID);
    }
  });
});

describe("mergeExtractions — confidence final", () => {
  it("dois tiers sem divergência → confidence alta", () => {
    const tiers: ExtractionTierContribution[] = [
      { tier: "deterministic", output: { amount_cents: money(150000) } },
      { tier: "vlm_cheap", output: { amount_cents: money(150000), confidence: 0.9 } },
    ];

    const result = mergeExtractions(tiers);

    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value.confidence).toBeGreaterThan(0.9);
  });

  it("tier com divergência em campo crítico → confidence penalizada", () => {
    const withoutDivergence = mergeExtractions([
      { tier: "deterministic", output: { amount_cents: money(150000) } },
      { tier: "vlm_cheap", output: { amount_cents: money(150000), confidence: 0.9 } },
    ]);
    const withDivergence = mergeExtractions([
      { tier: "deterministic", output: { amount_cents: money(150000) } },
      { tier: "vlm_cheap", output: { amount_cents: money(150500), confidence: 0.9 } },
    ]);

    expect(isOk(withoutDivergence)).toBe(true);
    expect(isOk(withDivergence)).toBe(true);
    if (isOk(withoutDivergence) && isOk(withDivergence)) {
      expect(withDivergence.value.confidence).toBeLessThan(withoutDivergence.value.confidence);
      expect(withDivergence.value.confidence).toBeLessThan(0.7);
    }
  });
});

describe("mergeExtractions — null explícito não conflita com valor concreto", () => {
  it("tier que devolve null (ambíguo) não cria divergência com tier que extraiu valor", () => {
    const tiers: ExtractionTierContribution[] = [
      { tier: "deterministic", output: { paid_at: null } },
      { tier: "vlm_cheap", output: { paid_at: "2026-08-12", confidence: 0.9 } },
    ];

    const result = mergeExtractions(tiers);

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.paid_at).toBe("2026-08-12");
      expect(result.value.anomalies).toEqual([]);
    }
  });
});

describe("mergeExtractions — nenhum tier se pronuncia", () => {
  it("aplica defaults: is_payment_receipt true, method unknown, campos null", () => {
    const result = mergeExtractions([]);

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.is_payment_receipt).toBe(true);
      expect(result.value.method).toBe("unknown");
      expect(result.value.amount_cents).toBeNull();
      expect(result.value.confidence).toBe(0);
    }
  });
});
