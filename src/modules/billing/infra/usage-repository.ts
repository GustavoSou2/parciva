/**
 * Implementa `EnforceQuotaDeps` (`application/enforce-quota.ts`) contra
 * o banco real — spec §11.1 (`plans.limits`) e §11.3 (`usage_counters`,
 * `INSERT ... ON CONFLICT DO UPDATE` transacional). Sempre via
 * `getDb(ctx)` (invariante 3) — `tenants`/`plans` são raiz (sem RLS),
 * `usage_counters` tem RLS de verdade (testada no Marco 6).
 */

import { and, eq, sql } from "drizzle-orm";
import { getDb, type TenantContext } from "@/db/client";
import { tenants, plans, usageCounters } from "@/db/schema/tenancy";
import type { PlanLimits, UsageMetric } from "../domain/types";

/** Início do mês corrente em UTC — mesma referência usada pra gravar e pra ler, senão o contador nunca bate. */
function startOfMonthUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** Lança se o tenant/plano não existir — `enforceQuota()` já trata isso como `"plan_not_found"`. */
export async function getLimits(tenantId: string): Promise<PlanLimits> {
  const ctx: TenantContext = { tenantId };
  const rows = await getDb(ctx, (db) =>
    db
      .select({ limits: plans.limits })
      .from(tenants)
      .innerJoin(plans, eq(tenants.planId, plans.id))
      .where(eq(tenants.id, tenantId))
      .limit(1),
  );
  const row = rows[0];
  if (!row) throw new Error(`Plano não encontrado para o tenant ${tenantId}.`);
  return row.limits as PlanLimits;
}

export async function getCurrentUsage(tenantId: string, metric: UsageMetric): Promise<number> {
  const ctx: TenantContext = { tenantId };
  const periodStart = startOfMonthUtc();
  const rows = await getDb(ctx, (db) =>
    db
      .select({ value: usageCounters.value })
      .from(usageCounters)
      .where(
        and(
          eq(usageCounters.tenantId, tenantId),
          eq(usageCounters.periodStart, periodStart),
          eq(usageCounters.metric, metric),
        ),
      )
      .limit(1),
  );
  const row = rows[0];
  return row ? Number(row.value) : 0;
}

/** `value` é `text` no schema (não integer) — cast explícito no próprio UPDATE, não é bug a corrigir aqui. */
export async function incrementUsage(tenantId: string, metric: UsageMetric): Promise<void> {
  const ctx: TenantContext = { tenantId };
  const periodStart = startOfMonthUtc();
  await getDb(ctx, (db) =>
    db
      .insert(usageCounters)
      .values({ tenantId, periodStart, metric, value: "1" })
      .onConflictDoUpdate({
        target: [usageCounters.tenantId, usageCounters.periodStart, usageCounters.metric],
        set: { value: sql`(${usageCounters.value}::int + 1)::text` },
      }),
  );
}
