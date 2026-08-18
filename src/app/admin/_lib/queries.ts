/**
 * Queries do painel de superadmin — spec §12. Fora de `src/modules/`
 * de propósito: `admin-client.ts` só pode ser importado por
 * `src/app/admin/**`, nunca por um módulo de domínio (comentário em
 * `admin-client.ts`) — mesmo padrão de `src/app/_lib/
 * require-tenant-session.ts` (glue específico do Next.js, não regra de
 * negócio). Tipos reaproveitados de `src/modules/admin/domain/types.ts`
 * (puros, sem I/O — seguro importar daqui).
 *
 * Sem quebra-vidro (justificativa/janela/notificação ao Owner) nem
 * registro em `audit_logs` — fora do escopo desta tarefa, que só
 * conecta o que já era stub ao banco real. TODO já documentado em
 * `admin-client.ts`.
 */

import { count, desc, eq, gte, sql } from "drizzle-orm";
import { getAdminDb } from "@/db/admin-client";
import { tenants, plans } from "@/db/schema/tenancy";
import { receipts, receiptExtractions } from "@/db/schema/ingestion";
import { reconciliationProposals } from "@/db/schema/financial";
import { money, ZERO, type Money } from "@/shared/money";
import type { GlobalMetrics, TenantSummary } from "@/modules/admin";

function startOfTodayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function startOfMonthUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** `cost_micros` (1 unidade monetária = 1_000_000 micros) → centavos (1 unidade = 100 centavos): dividir por 10_000. */
function microsToCents(micros: number): Money {
  return money(Math.round(micros / 10_000));
}

export async function getGlobalMetrics(): Promise<GlobalMetrics> {
  const db = getAdminDb();
  const today = startOfTodayUtc();

  const [[activeTenants], [receiptsToday], [aiCost], [reviewQueue]] = await Promise.all([
    db.select({ value: count() }).from(tenants).where(eq(tenants.status, "active")),
    db.select({ value: count() }).from(receipts).where(gte(receipts.receivedAt, today)),
    db
      .select({ value: sql<string | null>`sum(${receiptExtractions.costMicros})` })
      .from(receiptExtractions)
      .where(gte(receiptExtractions.createdAt, today)),
    db
      .select({ value: count() })
      .from(reconciliationProposals)
      .where(eq(reconciliationProposals.decision, "needs_review")),
  ]);

  return {
    activeTenants: activeTenants?.value ?? 0,
    receiptsToday: receiptsToday?.value ?? 0,
    aiCostTodayCents: aiCost?.value ? microsToCents(Number(aiCost.value)) : ZERO,
    reviewQueueSize: reviewQueue?.value ?? 0,
  };
}

export async function listTenantSummaries(): Promise<TenantSummary[]> {
  const db = getAdminDb();
  const monthStart = startOfMonthUtc();

  const [rows, receiptCounts, aiCosts] = await Promise.all([
    db
      .select({
        id: tenants.id,
        name: tenants.name,
        slug: tenants.slug,
        status: tenants.status,
        planCode: plans.code,
        createdAt: tenants.createdAt,
      })
      .from(tenants)
      .leftJoin(plans, eq(tenants.planId, plans.id))
      .orderBy(desc(tenants.createdAt)),
    db
      .select({ tenantId: receipts.tenantId, value: count() })
      .from(receipts)
      .where(gte(receipts.receivedAt, monthStart))
      .groupBy(receipts.tenantId),
    // `receipt_extractions.tenant_id` é coluna direta — sem join. Vai
    // mostrar R$ 0,00 pra todo mundo enquanto nenhum tier de VLM
    // estiver ligado (decisão [18]); é o valor real, não placeholder.
    db
      .select({ tenantId: receiptExtractions.tenantId, value: sql<string | null>`sum(${receiptExtractions.costMicros})` })
      .from(receiptExtractions)
      .where(gte(receiptExtractions.createdAt, monthStart))
      .groupBy(receiptExtractions.tenantId),
  ]);

  const receiptsByTenant = new Map(receiptCounts.map((r) => [r.tenantId, r.value]));
  const aiCostByTenant = new Map(aiCosts.map((r) => [r.tenantId, r.value ? microsToCents(Number(r.value)) : ZERO]));

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: row.status,
    planCode: row.planCode ?? "—",
    receiptsThisMonth: receiptsByTenant.get(row.id) ?? 0,
    aiCostThisMonthCents: aiCostByTenant.get(row.id) ?? ZERO,
    createdAt: row.createdAt,
  }));
}
