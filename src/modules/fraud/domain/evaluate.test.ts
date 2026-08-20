import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  BEHAVIORAL_CHECK_WEIGHTS,
  BEHAVIORAL_MAX_CONTRIBUTION,
  CHECK_WEIGHTS,
  DEFAULT_RISK_SCORE_THRESHOLD,
  evaluateFraudChecks,
} from "./evaluate";
import type { FraudSignals } from "./types";

const ALL_GOOD: FraudSignals = {
  amountMatches: true,
  datePlausible: true,
  transactionRefReused: false,
  velocityAnomaly: false,
  newPayerAmountDisproportionate: false,
  amountPatternSuspicious: false,
  phoneChanged: false,
};

const AB_TOTAL_WEIGHT = CHECK_WEIGHTS.amount_match + CHECK_WEIGHTS.date_plausible + CHECK_WEIGHTS.e2e_reuse;
const BEHAVIORAL_TOTAL_WEIGHT =
  BEHAVIORAL_CHECK_WEIGHTS.velocity +
  BEHAVIORAL_CHECK_WEIGHTS.history +
  BEHAVIORAL_CHECK_WEIGHTS.amount_pattern +
  BEHAVIORAL_CHECK_WEIGHTS.phone_change;

describe("evaluateFraudChecks", () => {
  it("todos os sinais bons → score 0, não bloqueia, 7 checks pass", () => {
    const result = evaluateFraudChecks(ALL_GOOD);
    expect(result.riskScore).toBe(0);
    expect(result.blocksAutoApply).toBe(false);
    expect(result.checks).toHaveLength(7);
    expect(result.checks.every((check) => check.result === "pass")).toBe(true);
  });

  it("transactionRefReused força needs_review mesmo com score sozinho abaixo do limiar", () => {
    const result = evaluateFraudChecks({ ...ALL_GOOD, transactionRefReused: true });
    expect(result.blocksAutoApply).toBe(true);
    const e2e = result.checks.find((check) => check.code === "e2e_reuse");
    expect(e2e?.result).toBe("fail");
    expect(e2e?.detail).toBeTruthy();
  });

  it("amount_match e date_plausible falhando juntos passam do limiar padrão e bloqueiam por score, sem nenhum check forçado — mesmo cálculo de antes de Camada C existir", () => {
    const result = evaluateFraudChecks({ ...ALL_GOOD, amountMatches: false, datePlausible: false });
    const expectedScore = (100 * (CHECK_WEIGHTS.amount_match + CHECK_WEIGHTS.date_plausible)) / AB_TOTAL_WEIGHT;
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
    const scoreFromE2eAlone = (100 * CHECK_WEIGHTS.e2e_reuse) / AB_TOTAL_WEIGHT;
    expect(scoreFromE2eAlone).toBeLessThanOrEqual(DEFAULT_RISK_SCORE_THRESHOLD);
    expect(result.blocksAutoApply).toBe(true);
  });

  it("cada sinal de Camada C sozinho produz warn, soma ao score dentro do limite de contribuição, mas nunca bloqueia sozinho", () => {
    for (const [field, code] of [
      ["velocityAnomaly", "velocity"],
      ["newPayerAmountDisproportionate", "history"],
      ["amountPatternSuspicious", "amount_pattern"],
      ["phoneChanged", "phone_change"],
    ] as const) {
      const result = evaluateFraudChecks({ ...ALL_GOOD, [field]: true });
      const check = result.checks.find((c) => c.code === code);
      expect(check?.result).toBe("warn");
      expect(check?.detail).toBeTruthy();
      const expectedScore = (BEHAVIORAL_MAX_CONTRIBUTION * BEHAVIORAL_CHECK_WEIGHTS[code]) / BEHAVIORAL_TOTAL_WEIGHT;
      expect(result.riskScore).toBeCloseTo(expectedScore, 5);
      expect(result.riskScore).toBeLessThan(BEHAVIORAL_MAX_CONTRIBUTION + 0.001);
      expect(result.blocksAutoApply).toBe(false);
    }
  });

  it("todos os 4 sinais de Camada C juntos batem o teto de contribuição e ainda não bloqueiam sozinhos", () => {
    const result = evaluateFraudChecks({
      ...ALL_GOOD,
      velocityAnomaly: true,
      newPayerAmountDisproportionate: true,
      amountPatternSuspicious: true,
      phoneChanged: true,
    });
    expect(result.checks.filter((c) => c.result === "warn")).toHaveLength(4);
    expect(result.riskScore).toBeCloseTo(BEHAVIORAL_MAX_CONTRIBUTION, 5);
    expect(result.riskScore).toBeLessThanOrEqual(DEFAULT_RISK_SCORE_THRESHOLD);
    expect(result.blocksAutoApply).toBe(false);
  });

  it("Camada C some ao score de Camada A/B em vez de substituí-lo, capado em 100", () => {
    const result = evaluateFraudChecks({
      ...ALL_GOOD,
      amountMatches: false,
      datePlausible: false,
      velocityAnomaly: true,
      newPayerAmountDisproportionate: true,
      amountPatternSuspicious: true,
      phoneChanged: true,
    });
    const abScore = (100 * (CHECK_WEIGHTS.amount_match + CHECK_WEIGHTS.date_plausible)) / AB_TOTAL_WEIGHT;
    expect(result.riskScore).toBeCloseTo(Math.min(100, abScore + BEHAVIORAL_MAX_CONTRIBUTION), 5);
  });

  it("propriedade: riskScore sempre entre 0 e 100, e nunca undefined/NaN", () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        (
          amountMatches,
          datePlausible,
          transactionRefReused,
          velocityAnomaly,
          newPayerAmountDisproportionate,
          amountPatternSuspicious,
          phoneChanged,
        ) => {
          const result = evaluateFraudChecks({
            amountMatches,
            datePlausible,
            transactionRefReused,
            velocityAnomaly,
            newPayerAmountDisproportionate,
            amountPatternSuspicious,
            phoneChanged,
          });
          expect(Number.isFinite(result.riskScore)).toBe(true);
          expect(result.riskScore).toBeGreaterThanOrEqual(0);
          expect(result.riskScore).toBeLessThanOrEqual(100);
        },
      ),
    );
  });

  it("propriedade: e2e_reuse falho sempre bloqueia, independente dos outros sinais", () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        (amountMatches, datePlausible, velocityAnomaly, newPayerAmountDisproportionate, amountPatternSuspicious, phoneChanged) => {
          const result = evaluateFraudChecks({
            amountMatches,
            datePlausible,
            transactionRefReused: true,
            velocityAnomaly,
            newPayerAmountDisproportionate,
            amountPatternSuspicious,
            phoneChanged,
          });
          expect(result.blocksAutoApply).toBe(true);
        },
      ),
    );
  });

  it("propriedade: nenhum sinal de Camada C, sozinho ou combinado, bloqueia sem amount_match/date_plausible/e2e_reuse ruins", () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        (velocityAnomaly, newPayerAmountDisproportionate, amountPatternSuspicious, phoneChanged) => {
          const result = evaluateFraudChecks({
            ...ALL_GOOD,
            velocityAnomaly,
            newPayerAmountDisproportionate,
            amountPatternSuspicious,
            phoneChanged,
          });
          expect(result.blocksAutoApply).toBe(false);
        },
      ),
    );
  });
});
