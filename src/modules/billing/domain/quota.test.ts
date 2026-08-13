import { describe, expect, it } from "vitest";
import { checkQuota, isFeatureEnabled, PLAN_LIMITS } from "./quota";

// PLAN_LIMITS é Record<string, PlanLimits> — os `!` abaixo afirmam o que
// já sabemos estaticamente: essas chaves existem (definidas em quota.ts).
const free = PLAN_LIMITS.free!;
const essential = PLAN_LIMITS.essential!;
const professional = PLAN_LIMITS.professional!;

describe("checkQuota", () => {
  it("abaixo do limite → allowed: true, warning: false", () => {
    const status = checkQuota("receipts_per_month", 10, free);
    expect(status.allowed).toBe(true);
    expect(status.warning).toBe(false);
  });

  it("em 80% → warning: true, allowed: true", () => {
    const status = checkQuota("active_contracts", 80, essential);
    expect(status.pct).toBe(80);
    expect(status.warning).toBe(true);
    expect(status.allowed).toBe(true);
  });

  it("no limite exato → allowed: false", () => {
    const status = checkQuota("receipts_per_month", 30, free);
    expect(status.allowed).toBe(false);
  });

  it("acima do limite → allowed: false", () => {
    const status = checkQuota("receipts_per_month", 31, free);
    expect(status.allowed).toBe(false);
  });
});

describe("isFeatureEnabled", () => {
  it("retorna false para feature do plano free", () => {
    expect(isFeatureEnabled("premiumExtraction", free)).toBe(false);
  });

  it("retorna true para feature do plano professional", () => {
    expect(isFeatureEnabled("apiAccess", professional)).toBe(true);
  });
});
