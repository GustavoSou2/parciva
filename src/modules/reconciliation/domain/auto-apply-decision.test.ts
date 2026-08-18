import { describe, expect, it } from "vitest";
import { money, ZERO } from "@/shared/money";
import { decideAutoApply, type AutoApplyInput } from "./auto-apply-decision";

const NOW = new Date("2026-08-17T12:00:00-03:00");

function input(overrides: Partial<AutoApplyInput> = {}): AutoApplyInput {
  return {
    confidence: 0.95,
    fieldConfidence: {},
    identificationTier: "phone",
    remainingCents: ZERO,
    paidAt: new Date("2026-08-17T09:00:00-03:00"),
    referenceDate: NOW,
    amountCents: money(10000),
    ceilingCents: money(500000),
    ...overrides,
  };
}

describe("decideAutoApply — §6.6 (risco/fraude é no-op documentado neste marco)", () => {
  it("aprova quando todas as condições reais são satisfeitas", () => {
    expect(decideAutoApply(input())).toBe("auto_applied");
  });

  it("confiança abaixo de 0.90 -> revisão", () => {
    expect(decideAutoApply(input({ confidence: 0.89 }))).toBe("needs_review");
  });

  it("campo crítico com field_confidence abaixo de 0.85 -> revisão", () => {
    expect(decideAutoApply(input({ fieldConfidence: { amount_cents: 0.5 } }))).toBe("needs_review");
  });

  it("field_confidence ausente (não populado por nenhum tier hoje) não bloqueia", () => {
    expect(decideAutoApply(input({ fieldConfidence: {} }))).toBe("auto_applied");
  });

  it("identificação por nome (fraca) nunca auto-aplica", () => {
    expect(decideAutoApply(input({ identificationTier: "name" }))).toBe("needs_review");
  });

  it("sem identificação nenhuma -> revisão", () => {
    expect(decideAutoApply(input({ identificationTier: null }))).toBe("needs_review");
  });

  it("sobra na alocação (remainingCents > 0) -> revisão, mesmo com tudo mais certo", () => {
    expect(decideAutoApply(input({ remainingCents: money(100) }))).toBe("needs_review");
  });

  it("data no futuro -> revisão", () => {
    expect(decideAutoApply(input({ paidAt: new Date("2026-08-18T09:00:00-03:00") }))).toBe(
      "needs_review",
    );
  });

  it("data mais de 30 dias no passado -> revisão", () => {
    expect(decideAutoApply(input({ paidAt: new Date("2026-07-01T09:00:00-03:00") }))).toBe(
      "needs_review",
    );
  });

  it("data exatamente 30 dias no passado ainda é plausível", () => {
    const paidAt = new Date(NOW.getTime() - 30 * 24 * 60 * 60 * 1000);
    expect(decideAutoApply(input({ paidAt }))).toBe("auto_applied");
  });

  it("valor acima do teto de auto-aprovação -> revisão", () => {
    expect(decideAutoApply(input({ amountCents: money(600000), ceilingCents: money(500000) }))).toBe(
      "needs_review",
    );
  });

  it("valor exatamente no teto ainda auto-aplica", () => {
    expect(decideAutoApply(input({ amountCents: money(500000), ceilingCents: money(500000) }))).toBe(
      "auto_applied",
    );
  });
});
