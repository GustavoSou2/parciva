import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { money } from "@/shared/money";
import {
  detectAmountPatternAnomaly,
  detectDisproportionateNewPayerAmount,
  detectPhoneChange,
  detectVelocityAnomaly,
  VELOCITY_MIN_COUNT,
  AMOUNT_PATTERN_MIN_DISTINCT_PAYERS,
  HISTORY_DISPROPORTION_MULTIPLIER,
} from "./behavior";

const WINDOW_START = new Date("2026-08-19T00:00:00Z");
const DAY_MS = 24 * 60 * 60 * 1000;

describe("detectVelocityAnomaly", () => {
  it("pagador sem histórico e poucos comprovantes na janela → não dispara", () => {
    const result = detectVelocityAnomaly(
      { recentAcceptedCount: 1, priorAcceptedCount: 0, firstAcceptedAt: null },
      WINDOW_START,
    );
    expect(result).toBe(false);
  });

  it("pagador sem histórico, mas abaixo do piso absoluto → não dispara", () => {
    const result = detectVelocityAnomaly(
      { recentAcceptedCount: VELOCITY_MIN_COUNT - 1, priorAcceptedCount: 0, firstAcceptedAt: null },
      WINDOW_START,
    );
    expect(result).toBe(false);
  });

  it("pagador sem histórico, rajada acima do piso absoluto → dispara", () => {
    const result = detectVelocityAnomaly(
      { recentAcceptedCount: VELOCITY_MIN_COUNT, priorAcceptedCount: 0, firstAcceptedAt: null },
      WINDOW_START,
    );
    expect(result).toBe(true);
  });

  it("pagador com taxa histórica alta absorve rajada equivalente sem disparar", () => {
    const firstAcceptedAt = new Date(WINDOW_START.getTime() - 10 * DAY_MS);
    // 20 pagamentos em 10 dias = 2/dia; rajada de 5 (< 2*3=6) não deveria disparar.
    const result = detectVelocityAnomaly(
      { recentAcceptedCount: 5, priorAcceptedCount: 20, firstAcceptedAt },
      WINDOW_START,
    );
    expect(result).toBe(false);
  });

  it("rajada muito acima da taxa histórica dispara mesmo com histórico normal", () => {
    const firstAcceptedAt = new Date(WINDOW_START.getTime() - 10 * DAY_MS);
    // 5 pagamentos em 10 dias = 0.5/dia (piso 1/dia); rajada de 10 (> 1*3) dispara.
    const result = detectVelocityAnomaly(
      { recentAcceptedCount: 10, priorAcceptedCount: 5, firstAcceptedAt },
      WINDOW_START,
    );
    expect(result).toBe(true);
  });

  it("propriedade: nunca dispara abaixo do piso absoluto, qualquer que seja o histórico", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: VELOCITY_MIN_COUNT - 1 }),
        fc.integer({ min: 0, max: 1000 }),
        fc.integer({ min: 1, max: 365 }),
        (recentAcceptedCount, priorAcceptedCount, daysAgo) => {
          const result = detectVelocityAnomaly(
            {
              recentAcceptedCount,
              priorAcceptedCount,
              firstAcceptedAt: new Date(WINDOW_START.getTime() - daysAgo * DAY_MS),
            },
            WINDOW_START,
          );
          expect(result).toBe(false);
        },
      ),
    );
  });
});

describe("detectDisproportionateNewPayerAmount", () => {
  it("pagador com histórico prévio nunca dispara, mesmo com valor alto", () => {
    const result = detectDisproportionateNewPayerAmount({
      totalAcceptedCount: 1,
      amountCents: money(1_000_000),
      averageInstallmentCents: money(10_000),
    });
    expect(result).toBe(false);
  });

  it("sem baseline (nenhuma parcela) nunca dispara", () => {
    const result = detectDisproportionateNewPayerAmount({
      totalAcceptedCount: 0,
      amountCents: money(1_000_000),
      averageInstallmentCents: null,
    });
    expect(result).toBe(false);
  });

  it("pagador novo com valor dentro da própria média de parcelas não dispara (caso 'primeira parcela grande de contrato novo')", () => {
    const result = detectDisproportionateNewPayerAmount({
      totalAcceptedCount: 0,
      amountCents: money(50_000),
      averageInstallmentCents: money(50_000),
    });
    expect(result).toBe(false);
  });

  it("pagador novo com valor muito acima da própria média de parcelas dispara", () => {
    const result = detectDisproportionateNewPayerAmount({
      totalAcceptedCount: 0,
      amountCents: money(50_000 * HISTORY_DISPROPORTION_MULTIPLIER + 1),
      averageInstallmentCents: money(50_000),
    });
    expect(result).toBe(true);
  });
});

describe("detectAmountPatternAnomaly", () => {
  it("abaixo do mínimo de pagadores distintos não dispara", () => {
    expect(detectAmountPatternAnomaly(AMOUNT_PATTERN_MIN_DISTINCT_PAYERS - 1)).toBe(false);
  });

  it("no mínimo (ou acima) de pagadores distintos dispara", () => {
    expect(detectAmountPatternAnomaly(AMOUNT_PATTERN_MIN_DISTINCT_PAYERS)).toBe(true);
  });
});

describe("detectPhoneChange", () => {
  it("sem telefone de origem ou sem telefone cadastrado nunca dispara", () => {
    expect(detectPhoneChange(null, "+5511999999999")).toBe(false);
    expect(detectPhoneChange("+5511999999999", null)).toBe(false);
    expect(detectPhoneChange(null, null)).toBe(false);
  });

  it("mesmo telefone não dispara", () => {
    expect(detectPhoneChange("+5511999999999", "+5511999999999")).toBe(false);
  });

  it("telefone diferente dispara", () => {
    expect(detectPhoneChange("+5511888888888", "+5511999999999")).toBe(true);
  });
});
