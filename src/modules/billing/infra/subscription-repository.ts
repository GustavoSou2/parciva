/**
 * Persistência da assinatura Parciva↔tenant (spec §14 Fase 4) — nunca
 * confundir com `psp_connections`/`charges` (Modelo B, invariante 8/9).
 * `plans`/`tenants` são tabelas raiz (sem RLS, `getRootDb()`, mesmo
 * padrão de `tenant/infra/tenant-repository.ts`); `subscriptions` TEM
 * RLS de verdade (testada no Marco 6) — sempre `getDb(ctx)`.
 */

import { eq } from "drizzle-orm";
import { getDb, getRootDb, type TenantContext } from "@/db/client";
import { plans, tenants, subscriptions } from "@/db/schema/tenancy";

export interface BillablePlan {
  readonly id: string;
  readonly priceCents: number;
  readonly abacatePayProductId: string | null;
}

export async function getPlanByCode(planCode: string): Promise<BillablePlan | null> {
  const rows = await getRootDb()
    .select({ id: plans.id, priceCents: plans.priceCents, abacatePayProductId: plans.abacatePayProductId })
    .from(plans)
    .where(eq(plans.code, planCode))
    .limit(1);
  return rows[0] ?? null;
}

export async function saveAbacatePayProductId(planCode: string, productId: string): Promise<void> {
  await getRootDb().update(plans).set({ abacatePayProductId: productId }).where(eq(plans.code, planCode));
}

/** Usado pelo cron de renovação (`renew-subscriptions.ts`) — a assinatura só guarda `planId`, não o código do plano. */
export async function getPlanById(planId: string): Promise<{ code: string } | null> {
  const rows = await getRootDb().select({ code: plans.code }).from(plans).where(eq(plans.id, planId)).limit(1);
  return rows[0] ?? null;
}

export async function getTenantBillingCustomerRef(tenantId: string): Promise<string | null> {
  const rows = await getRootDb()
    .select({ ref: tenants.billingCustomerRef })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  return rows[0]?.ref ?? null;
}

export async function saveTenantBillingCustomerRef(tenantId: string, customerRef: string): Promise<void> {
  await getRootDb().update(tenants).set({ billingCustomerRef: customerRef }).where(eq(tenants.id, tenantId));
}

export interface UpsertSubscriptionInput {
  readonly tenantId: string;
  readonly planId: string;
  readonly providerRef: string;
  readonly status: string;
  readonly currentPeriodStart: Date;
  readonly currentPeriodEnd: Date;
  readonly cancelAt?: Date | null;
}

/**
 * Uma linha "atual" por tenant — sem unique index em `tenant_id`
 * sozinho (schema permite histórico), então isto é select-then-write,
 * não `ON CONFLICT`. Volume de escrita é baixo (1x/ciclo de cobrança
 * por tenant), não é caminho de alta concorrência.
 */
export async function upsertSubscription(input: UpsertSubscriptionInput): Promise<void> {
  const ctx: TenantContext = { tenantId: input.tenantId };
  await getDb(ctx, async (db) => {
    const existing = await db
      .select({ id: subscriptions.id })
      .from(subscriptions)
      .where(eq(subscriptions.tenantId, input.tenantId))
      .limit(1);

    if (existing[0]) {
      await db
        .update(subscriptions)
        .set({
          planId: input.planId,
          provider: "abacatepay",
          providerRef: input.providerRef,
          status: input.status,
          currentPeriodStart: input.currentPeriodStart,
          currentPeriodEnd: input.currentPeriodEnd,
          cancelAt: input.cancelAt ?? null,
        })
        .where(eq(subscriptions.id, existing[0].id));
    } else {
      await db.insert(subscriptions).values({
        tenantId: input.tenantId,
        planId: input.planId,
        provider: "abacatepay",
        providerRef: input.providerRef,
        status: input.status,
        currentPeriodStart: input.currentPeriodStart,
        currentPeriodEnd: input.currentPeriodEnd,
        cancelAt: input.cancelAt ?? null,
      });
    }
  });
}

/** Cancelamento pedido pelo dono (spec DoD) — efetiva no FIM do ciclo pago, tenant continua ativo até lá. */
export async function scheduleSubscriptionCancellation(tenantId: string, cancelAt: Date): Promise<void> {
  const ctx: TenantContext = { tenantId };
  await getDb(ctx, (db) =>
    db.update(subscriptions).set({ cancelAt }).where(eq(subscriptions.tenantId, tenantId)),
  );
}

/** Cancelamento efetivado pelo cron ao chegar em `cancel_at` (nunca antes) — ver `renew-subscriptions.ts`. */
export async function markSubscriptionCancelled(tenantId: string): Promise<void> {
  const ctx: TenantContext = { tenantId };
  await getDb(ctx, (db) =>
    db.update(subscriptions).set({ status: "cancelled" }).where(eq(subscriptions.tenantId, tenantId)),
  );
}

/**
 * Marca a assinatura como vencida no momento em que o cron gera a
 * cobrança do próximo ciclo — guarda redundante contra reencaminhar
 * cobrança todo dia (a checagem primária é a validade da transição de
 * `tenants.status`, ver `renew-subscriptions.ts`; esta é a segunda
 * camada, mesmo espírito de defesa em profundidade da decisão [1]).
 */
export async function markSubscriptionPastDue(tenantId: string): Promise<void> {
  const ctx: TenantContext = { tenantId };
  await getDb(ctx, (db) =>
    db.update(subscriptions).set({ status: "past_due" }).where(eq(subscriptions.tenantId, tenantId)),
  );
}

export async function getSubscriptionByTenant(
  tenantId: string,
): Promise<{ planId: string; status: string; currentPeriodEnd: Date; cancelAt: Date | null } | null> {
  const ctx: TenantContext = { tenantId };
  const rows = await getDb(ctx, (db) =>
    db
      .select({
        planId: subscriptions.planId,
        status: subscriptions.status,
        currentPeriodEnd: subscriptions.currentPeriodEnd,
        cancelAt: subscriptions.cancelAt,
      })
      .from(subscriptions)
      .where(eq(subscriptions.tenantId, tenantId))
      .limit(1),
  );
  return rows[0] ?? null;
}
