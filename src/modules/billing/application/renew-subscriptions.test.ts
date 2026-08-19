/**
 * Cron de renovação (decisão [25]) — testa a lógica de decisão pura,
 * sem banco/rede: quem é selecionado, quem cai em cancelamento
 * vs. renovação, e as duas guardas independentes contra reencaminhar a
 * mesma cobrança em dias seguintes (validade da transição de
 * `tenants.status` + `markSubscriptionPastDue` tirando a assinatura do
 * filtro `status === "active"`).
 */

import { describe, expect, it, vi } from "vitest";
import { err, ok } from "@/shared/result";
import { renewDueSubscriptions, type RenewSubscriptionsDeps, type SubscriptionDue } from "./renew-subscriptions";

const NOW = new Date("2026-08-18T12:00:00Z");
const PAST = new Date("2026-08-17T00:00:00Z");
const FUTURE = new Date("2026-09-18T00:00:00Z");
/** 8 dias antes de NOW — além dos 7 dias de tolerância de dunning. */
const OVERDUE_PAST = new Date("2026-08-10T00:00:00Z");
const APP_BASE_URL = "https://parciva.example.com";

interface Spies {
  readonly listTenantIds: ReturnType<typeof vi.fn<() => Promise<string[]>>>;
  readonly getSubscriptionByTenant: ReturnType<typeof vi.fn<(tenantId: string) => Promise<SubscriptionDue | null>>>;
  readonly getTenantStatus: ReturnType<typeof vi.fn>;
  readonly setTenantStatus: ReturnType<typeof vi.fn>;
  readonly markSubscriptionCancelled: ReturnType<typeof vi.fn>;
  readonly markSubscriptionPastDue: ReturnType<typeof vi.fn>;
  readonly getPlanById: ReturnType<typeof vi.fn>;
  readonly getTenantSlugById: ReturnType<typeof vi.fn>;
  readonly createRenewalCheckout: ReturnType<typeof vi.fn>;
}

function buildDeps(overrides: Partial<Spies> = {}): { deps: RenewSubscriptionsDeps; spies: Spies } {
  const spies: Spies = {
    listTenantIds: vi.fn<() => Promise<string[]>>().mockResolvedValue(["tenant-1"]),
    getSubscriptionByTenant: vi.fn<(tenantId: string) => Promise<SubscriptionDue | null>>().mockResolvedValue(null),
    getTenantStatus: vi.fn().mockResolvedValue("active"),
    setTenantStatus: vi.fn().mockResolvedValue(undefined),
    markSubscriptionCancelled: vi.fn().mockResolvedValue(undefined),
    markSubscriptionPastDue: vi.fn().mockResolvedValue(undefined),
    getPlanById: vi.fn().mockResolvedValue({ code: "essential" }),
    getTenantSlugById: vi.fn().mockResolvedValue("loja-teste"),
    createRenewalCheckout: vi.fn().mockResolvedValue(ok({ checkoutUrl: "https://app.abacatepay.com/pay/bill_x" })),
    ...overrides,
  };
  return { deps: spies, spies };
}

describe("renewDueSubscriptions", () => {
  it("sem assinatura nenhuma → skipped, nenhuma mutação chamada", async () => {
    const { deps, spies } = buildDeps();
    const results = await renewDueSubscriptions(NOW, APP_BASE_URL, deps);

    expect(results).toEqual([{ tenantId: "tenant-1", outcome: "skipped" }]);
    expect(spies.setTenantStatus).not.toHaveBeenCalled();
    expect(spies.createRenewalCheckout).not.toHaveBeenCalled();
  });

  it("assinatura ativa mas ciclo ainda não venceu → skipped, sem mutação", async () => {
    const { deps, spies } = buildDeps({
      getSubscriptionByTenant: vi
        .fn<(tenantId: string) => Promise<SubscriptionDue | null>>()
        .mockResolvedValue({ planId: "plan-1", status: "active", currentPeriodEnd: FUTURE, cancelAt: null }),
    });

    const results = await renewDueSubscriptions(NOW, APP_BASE_URL, deps);

    expect(results).toEqual([{ tenantId: "tenant-1", outcome: "skipped" }]);
    expect(spies.createRenewalCheckout).not.toHaveBeenCalled();
  });

  it("assinatura vencida mas não 'active' (já past_due) → skipped, nunca reencaminha cobrança", async () => {
    const { deps, spies } = buildDeps({
      getSubscriptionByTenant: vi
        .fn<(tenantId: string) => Promise<SubscriptionDue | null>>()
        .mockResolvedValue({ planId: "plan-1", status: "past_due", currentPeriodEnd: PAST, cancelAt: null }),
    });

    const results = await renewDueSubscriptions(NOW, APP_BASE_URL, deps);

    expect(results).toEqual([{ tenantId: "tenant-1", outcome: "skipped" }]);
    expect(spies.createRenewalCheckout).not.toHaveBeenCalled();
  });

  it("ciclo vencido com cancelamento agendado no passado → cancela, nunca gera cobrança nova", async () => {
    const { deps, spies } = buildDeps({
      getSubscriptionByTenant: vi
        .fn<(tenantId: string) => Promise<SubscriptionDue | null>>()
        .mockResolvedValue({ planId: "plan-1", status: "active", currentPeriodEnd: PAST, cancelAt: PAST }),
    });

    const results = await renewDueSubscriptions(NOW, APP_BASE_URL, deps);

    expect(results).toEqual([{ tenantId: "tenant-1", outcome: "cancelled" }]);
    expect(spies.setTenantStatus).toHaveBeenCalledWith("tenant-1", "cancelled");
    expect(spies.markSubscriptionCancelled).toHaveBeenCalledWith("tenant-1");
    expect(spies.createRenewalCheckout).not.toHaveBeenCalled();
  });

  it("ciclo vencido sem cancelamento → gera cobrança do próximo ciclo e marca past_due", async () => {
    const { deps, spies } = buildDeps({
      getSubscriptionByTenant: vi
        .fn<(tenantId: string) => Promise<SubscriptionDue | null>>()
        .mockResolvedValue({ planId: "plan-1", status: "active", currentPeriodEnd: PAST, cancelAt: null }),
    });

    const results = await renewDueSubscriptions(NOW, APP_BASE_URL, deps);

    expect(results).toEqual([{ tenantId: "tenant-1", outcome: "renewal_created" }]);
    expect(spies.createRenewalCheckout).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      planCode: "essential",
      returnUrl: "https://parciva.example.com/t/loja-teste/account",
      completionUrl: "https://parciva.example.com/t/loja-teste/account",
    });
    expect(spies.setTenantStatus).toHaveBeenCalledWith("tenant-1", "past_due");
    expect(spies.markSubscriptionPastDue).toHaveBeenCalledWith("tenant-1");
  });

  it("cobrança falha na AbacatePay → nunca muda status do tenant (não pune o cliente por falha nossa)", async () => {
    const { deps, spies } = buildDeps({
      getSubscriptionByTenant: vi
        .fn<(tenantId: string) => Promise<SubscriptionDue | null>>()
        .mockResolvedValue({ planId: "plan-1", status: "active", currentPeriodEnd: PAST, cancelAt: null }),
      createRenewalCheckout: vi.fn().mockResolvedValue(err("plan_not_found")),
    });

    const results = await renewDueSubscriptions(NOW, APP_BASE_URL, deps);

    expect(results).toEqual([{ tenantId: "tenant-1", outcome: "renewal_failed" }]);
    expect(spies.setTenantStatus).not.toHaveBeenCalled();
    expect(spies.markSubscriptionPastDue).not.toHaveBeenCalled();
  });

  it("tenant em trial com assinatura marcada active (estado inconsistente) → skipped antes de qualquer chamada à AbacatePay", async () => {
    const { deps, spies } = buildDeps({
      getSubscriptionByTenant: vi
        .fn<(tenantId: string) => Promise<SubscriptionDue | null>>()
        .mockResolvedValue({ planId: "plan-1", status: "active", currentPeriodEnd: PAST, cancelAt: null }),
      getTenantStatus: vi.fn().mockResolvedValue("trial"),
    });

    const results = await renewDueSubscriptions(NOW, APP_BASE_URL, deps);

    expect(results).toEqual([{ tenantId: "tenant-1", outcome: "skipped" }]);
    expect(spies.createRenewalCheckout).not.toHaveBeenCalled();
  });

  it("plano ou slug não encontrados → skipped, sem tentar cobrar", async () => {
    const { deps, spies } = buildDeps({
      getSubscriptionByTenant: vi
        .fn<(tenantId: string) => Promise<SubscriptionDue | null>>()
        .mockResolvedValue({ planId: "plan-1", status: "active", currentPeriodEnd: PAST, cancelAt: null }),
      getPlanById: vi.fn().mockResolvedValue(null),
    });

    const results = await renewDueSubscriptions(NOW, APP_BASE_URL, deps);

    expect(results).toEqual([{ tenantId: "tenant-1", outcome: "skipped" }]);
    expect(spies.createRenewalCheckout).not.toHaveBeenCalled();
  });

  it("past_due há mais de 7 dias (dunning) → suspende o tenant automaticamente", async () => {
    const { deps, spies } = buildDeps({
      getSubscriptionByTenant: vi
        .fn<(tenantId: string) => Promise<SubscriptionDue | null>>()
        .mockResolvedValue({ planId: "plan-1", status: "past_due", currentPeriodEnd: OVERDUE_PAST, cancelAt: null }),
      getTenantStatus: vi.fn().mockResolvedValue("past_due"),
    });

    const results = await renewDueSubscriptions(NOW, APP_BASE_URL, deps);

    expect(results).toEqual([{ tenantId: "tenant-1", outcome: "suspended" }]);
    expect(spies.setTenantStatus).toHaveBeenCalledWith("tenant-1", "suspended");
    expect(spies.createRenewalCheckout).not.toHaveBeenCalled();
  });

  it("tenant já suspenso (segunda rodada do cron) → skipped, nunca suspende de novo", async () => {
    const { deps, spies } = buildDeps({
      getSubscriptionByTenant: vi
        .fn<(tenantId: string) => Promise<SubscriptionDue | null>>()
        .mockResolvedValue({ planId: "plan-1", status: "past_due", currentPeriodEnd: OVERDUE_PAST, cancelAt: null }),
      getTenantStatus: vi.fn().mockResolvedValue("suspended"),
    });

    const results = await renewDueSubscriptions(NOW, APP_BASE_URL, deps);

    expect(results).toEqual([{ tenantId: "tenant-1", outcome: "skipped" }]);
    expect(spies.setTenantStatus).not.toHaveBeenCalled();
  });

  it("past_due com cancelamento pedido no passado → cancela, nunca suspende (antes ficava preso pra sempre)", async () => {
    const { deps, spies } = buildDeps({
      getSubscriptionByTenant: vi
        .fn<(tenantId: string) => Promise<SubscriptionDue | null>>()
        .mockResolvedValue({ planId: "plan-1", status: "past_due", currentPeriodEnd: OVERDUE_PAST, cancelAt: PAST }),
      getTenantStatus: vi.fn().mockResolvedValue("past_due"),
    });

    const results = await renewDueSubscriptions(NOW, APP_BASE_URL, deps);

    expect(results).toEqual([{ tenantId: "tenant-1", outcome: "cancelled" }]);
    expect(spies.setTenantStatus).toHaveBeenCalledWith("tenant-1", "cancelled");
    expect(spies.markSubscriptionCancelled).toHaveBeenCalledWith("tenant-1");
  });

  it("processa múltiplos tenants de forma independente", async () => {
    const subscriptionsByTenant: Record<string, SubscriptionDue | null> = {
      "tenant-1": { planId: "plan-1", status: "active", currentPeriodEnd: FUTURE, cancelAt: null },
      "tenant-2": { planId: "plan-1", status: "active", currentPeriodEnd: PAST, cancelAt: null },
    };
    const { deps } = buildDeps({
      listTenantIds: vi.fn<() => Promise<string[]>>().mockResolvedValue(["tenant-1", "tenant-2"]),
      getSubscriptionByTenant: vi
        .fn<(tenantId: string) => Promise<SubscriptionDue | null>>()
        .mockImplementation((tenantId) => Promise.resolve(subscriptionsByTenant[tenantId] ?? null)),
    });

    const results = await renewDueSubscriptions(NOW, APP_BASE_URL, deps);

    expect(results).toEqual([
      { tenantId: "tenant-1", outcome: "skipped" },
      { tenantId: "tenant-2", outcome: "renewal_created" },
    ]);
  });
});
