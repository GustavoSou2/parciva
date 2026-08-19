import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { CHECK_WEIGHTS, DEFAULT_RISK_SCORE_THRESHOLD, evaluateFraudChecks } from "./evaluate";
import type { FraudSignals } from "./types";

const ALL_GOOD: FraudSignals = { amountMatches: true, datePlausible: true, transactionRefReused: false };

describe("evaluateFraudChecks", () => {
  it("todos os sinais bons → score 0, não bloqueia, 3 checks pass", () => {
    const result = evaluateFraudChecks(ALL_GOOD);
    expect(result.riskScore).toBe(0);
    expect(result.blocksAutoApply).toBe(false);
    expect(result.checks).toHaveLength(3);
    expect(result.checks.every((check) => check.result === "pass")).toBe(true);
  });

  it("transactionRefReused força needs_review mesmo com score sozinho abaixo do limiar", () => {
    const result = evaluateFraudChecks({ ...ALL_GOOD, transactionRefReused: true });
    expect(result.blocksAutoApply).toBe(true);
    const e2e = result.checks.find((check) => check.code === "e2e_reuse");
    expect(e2e?.result).toBe("fail");
    expect(e2e?.detail).toBeTruthy();
  });

  it("amount_match e date_plausible falhando juntos passam do limiar padrão e bloqueiam por score, sem nenhum check forçado", () => {
    const result = evaluateFraudChecks({ ...ALL_GOOD, amountMatches: false, datePlausible: false });
    const totalWeight = CHECK_WEIGHTS.amount_match + CHECK_WEIGHTS.date_plausible + CHECK_WEIGHTS.e2e_reuse;
    const expectedScore = (100 * (CHECK_WEIGHTS.amount_match + CHECK_WEIGHTS.date_plausible)) / totalWeight;
    expect(result.riskScore).toBeCloseTo(expectedScore, 5);
    expect(result.riskScore).toBeGreaterThan(DEFAULT_RISK_SCORE_THRESHOLD);
    expect(result.checks.find((c) => c.code === "e2e_reuse")?.result).toBe("pass");
    expect(result.blocksAutoApply).toBe(true);
  });

  it("só date_plausible falhando fica abaixo do limiar e não bloqueia por score (nem força)", () => {
    const result = evaluateFraudChecks({ ...ALL_GOOD, datePlausible: false });
    expect(result.riskScore).toBeLessThanOrEqual(DEFAULT_RISK_SCORE_THRESHOLD);
    expect(result.blocksAutoApply).toBe(false);
  });

  it("e2e_reuse sozinho força bloqueio mesmo quando o score isolado fica abaixo do limiar", () => {
    const result = evaluateFraudChecks({ ...ALL_GOOD, transactionRefReused: true });
    const totalWeight = CHECK_WEIGHTS.amount_match + CHECK_WEIGHTS.date_plausible + CHECK_WEIGHTS.e2e_reuse;
    const scoreFromE2eAlone = (100 * CHECK_WEIGHTS.e2e_reuse) / totalWeight;
    expect(scoreFromE2eAlone).toBeLessThanOrEqual(DEFAULT_RISK_SCORE_THRESHOLD);
    expect(result.blocksAutoApply).toBe(true);
  });

  it("propriedade: riskScore sempre entre 0 e 100, e nunca undefined/NaN", () => {
    fc.assert(
      fc.property(fc.boolean(), fc.boolean(), fc.boolean(), (amountMatches, datePlausible, transactionRefReused) => {
        const result = evaluateFraudChecks({ amountMatches, datePlausible, transactionRefReused });
        expect(Number.isFinite(result.riskScore)).toBe(true);
        expect(result.riskScore).toBeGreaterThanOrEqual(0);
        expect(result.riskScore).toBeLessThanOrEqual(100);
      }),
    );
  });

  it("propriedade: e2e_reuse falho sempre bloqueia, independente dos outros dois sinais", () => {
    fc.assert(
      fc.property(fc.boolean(), fc.boolean(), (amountMatches, datePlausible) => {
        const result = evaluateFraudChecks({ amountMatches, datePlausible, transactionRefReused: true });
        expect(result.blocksAutoApply).toBe(true);
      }),
    );
  });
});
