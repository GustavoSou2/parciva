import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { computeAutomationRate, computeTrend, type ProposalDecisionCounts } from "./types";

function counts(overrides: Partial<ProposalDecisionCounts> = {}): ProposalDecisionCounts {
  return { autoApplied: 0, needsReview: 0, rejected: 0, reviewedApproved: 0, ...overrides };
}

describe("computeAutomationRate", () => {
  it("sem nenhuma proposta decidida -> null (nada a dividir)", () => {
    expect(computeAutomationRate(counts())).toBeNull();
  });

  it("tudo auto-aplicado -> 1", () => {
    expect(computeAutomationRate(counts({ autoApplied: 10 }))).toBe(1);
  });

  it("tudo em revisão -> 0", () => {
    expect(computeAutomationRate(counts({ needsReview: 10 }))).toBe(0);
  });

  it("reviewedApproved conta no denominador, nunca no numerador", () => {
    expect(computeAutomationRate(counts({ autoApplied: 1, reviewedApproved: 1 }))).toBe(0.5);
  });

  it("sempre entre 0 e 1 quando há pelo menos uma proposta decidida", () => {
    fc.assert(
      fc.property(
        fc.record({
          autoApplied: fc.nat({ max: 1000 }),
          needsReview: fc.nat({ max: 1000 }),
          rejected: fc.nat({ max: 1000 }),
          reviewedApproved: fc.nat({ max: 1000 }),
        }),
        (c) => {
          const total = c.autoApplied + c.needsReview + c.rejected + c.reviewedApproved;
          const rate = computeAutomationRate(c);
          if (total === 0) {
            expect(rate).toBeNull();
          } else {
            expect(rate).toBeGreaterThanOrEqual(0);
            expect(rate).toBeLessThanOrEqual(1);
          }
        },
      ),
    );
  });
});

describe("computeTrend", () => {
  it("período anterior zero -> null (variação de base zero não é um número)", () => {
    expect(computeTrend(100, 0)).toBeNull();
  });

  it("valores iguais -> null (estabilidade não é tendência)", () => {
    expect(computeTrend(50, 50)).toBeNull();
  });

  it("subiu -> direction 'up', percentual positivo", () => {
    expect(computeTrend(150, 100)).toEqual({ direction: "up", percent: 50 });
  });

  it("caiu -> direction 'down', percentual sempre positivo (sinal só em direction)", () => {
    expect(computeTrend(50, 100)).toEqual({ direction: "down", percent: 50 });
  });

  it("percent nunca negativo quando há tendência", () => {
    fc.assert(
      fc.property(
        fc.double({ min: -1_000_000, max: 1_000_000, noNaN: true }),
        fc.double({ min: -1_000_000, max: 1_000_000, noNaN: true }),
        (current, previous) => {
          const trend = computeTrend(current, previous);
          if (trend) expect(trend.percent).toBeGreaterThan(0);
        },
      ),
    );
  });
});
