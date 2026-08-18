/**
 * Isolamento cross-tenant — Marco 6 do roadmap. Cobre o restante das 13
 * tabelas de domínio originais: `memberships`, `subscriptions`,
 * `usage_counters`, `audit_logs`. `plans`/`users` são tabelas raiz (sem
 * `tenant_id`, fora da RLS por design — `src/db/schema/tenancy.ts`), só
 * servem de dependência de FK aqui.
 */

import { randomUUID } from "node:crypto";
import { eq, isNull } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb, getRootDb, getUserDb } from "@/db/client";
import { getAdminDb } from "@/db/admin-client";
import { tenants, plans, memberships, subscriptions, usageCounters, auditLogs } from "@/db/schema/tenancy";
import { createUser, createMembership, listMembershipsForUser } from "@/modules/identity";

function firstOrThrow<T>(rows: readonly T[]): T {
  const row = rows[0];
  if (!row) throw new Error("Insert de setup do teste não devolveu nenhuma linha.");
  return row;
}

let tenantAId: string;
let tenantBId: string;
let planId: string;
let userAId: string;
let userBId: string;
let membershipAId: string;
let membershipBId: string;
let subscriptionAId: string;
let subscriptionBId: string;
let usageCounterAId: string;
let usageCounterBId: string;
let auditLogAId: string;
let auditLogBId: string;
/** Linha de auditoria "global" — sem tenant, só o superadmin (BYPASSRLS) deveria ver. */
let auditLogGlobalId: string;

beforeAll(async () => {
  const root = getRootDb();

  const tenantA = firstOrThrow(
    await root
      .insert(tenants)
      .values({ name: "Tenant A (isolamento tenancy)", slug: `tenant-a-tenancy-${randomUUID()}` })
      .returning({ id: tenants.id }),
  );
  const tenantB = firstOrThrow(
    await root
      .insert(tenants)
      .values({ name: "Tenant B (isolamento tenancy)", slug: `tenant-b-tenancy-${randomUUID()}` })
      .returning({ id: tenants.id }),
  );
  tenantAId = tenantA.id;
  tenantBId = tenantB.id;

  const plan = firstOrThrow(
    await root
      .insert(plans)
      .values({ code: `isolamento-${randomUUID()}`, name: "Plano de teste", priceCents: 0 })
      .returning({ id: plans.id }),
  );
  planId = plan.id;

  const userA = await createUser({ email: `isolamento-a-${randomUUID()}@example.com`, name: "User A" });
  const userB = await createUser({ email: `isolamento-b-${randomUUID()}@example.com`, name: "User B" });
  userAId = userA.userId;
  userBId = userB.userId;

  const ctxA = { tenantId: tenantAId };
  const ctxB = { tenantId: tenantBId };

  await createMembership(ctxA, userAId, "owner", null, new Date());
  await createMembership(ctxB, userBId, "owner", null, new Date());
  const membershipA = firstOrThrow(
    await getDb(ctxA, (db) => db.select({ id: memberships.id }).from(memberships).where(eq(memberships.userId, userAId))),
  );
  const membershipB = firstOrThrow(
    await getDb(ctxB, (db) => db.select({ id: memberships.id }).from(memberships).where(eq(memberships.userId, userBId))),
  );
  membershipAId = membershipA.id;
  membershipBId = membershipB.id;

  // userA também entra no tenant B (papel diferente) — fixture pro
  // describe de self_membership_lookup abaixo.
  await createMembership(ctxB, userAId, "viewer", null, new Date());

  const now = new Date();
  const periodEnd = new Date(now.getTime() + 30 * 24 * 3_600_000);
  const subscriptionA = firstOrThrow(
    await getDb(ctxA, (db) =>
      db
        .insert(subscriptions)
        .values({
          tenantId: tenantAId,
          planId,
          provider: "manual",
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
        })
        .returning({ id: subscriptions.id }),
    ),
  );
  const subscriptionB = firstOrThrow(
    await getDb(ctxB, (db) =>
      db
        .insert(subscriptions)
        .values({
          tenantId: tenantBId,
          planId,
          provider: "manual",
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
        })
        .returning({ id: subscriptions.id }),
    ),
  );
  subscriptionAId = subscriptionA.id;
  subscriptionBId = subscriptionB.id;

  const usageCounterA = firstOrThrow(
    await getDb(ctxA, (db) =>
      db
        .insert(usageCounters)
        .values({ tenantId: tenantAId, periodStart: now, metric: "receipts_per_month", value: "1" })
        .returning({ id: usageCounters.id }),
    ),
  );
  const usageCounterB = firstOrThrow(
    await getDb(ctxB, (db) =>
      db
        .insert(usageCounters)
        .values({ tenantId: tenantBId, periodStart: now, metric: "receipts_per_month", value: "1" })
        .returning({ id: usageCounters.id }),
    ),
  );
  usageCounterAId = usageCounterA.id;
  usageCounterBId = usageCounterB.id;

  const auditLogA = firstOrThrow(
    await getDb(ctxA, (db) =>
      db
        .insert(auditLogs)
        .values({ tenantId: tenantAId, actorType: "user", actorId: userAId, action: "test", resourceType: "test" })
        .returning({ id: auditLogs.id }),
    ),
  );
  const auditLogB = firstOrThrow(
    await getDb(ctxB, (db) =>
      db
        .insert(auditLogs)
        .values({ tenantId: tenantBId, actorType: "user", actorId: userBId, action: "test", resourceType: "test" })
        .returning({ id: auditLogs.id }),
    ),
  );
  auditLogAId = auditLogA.id;
  auditLogBId = auditLogB.id;

  // Linha "global" (superadmin, spec §12) — `getRootDb()` conecta como
  // `parciva_app` (NOSUPERUSER NOBYPASSRLS, decisão [13]), que NÃO
  // bypassa RLS — só `getAdminDb()` (admin-client.ts) usa o role com
  // BYPASSRLS de verdade. Usar `getRootDb()` aqui falharia com "new row
  // violates row-level security policy", exatamente o comportamento que
  // este arquivo existe pra confirmar (root ≠ bypass).
  const admin = getAdminDb();
  const auditLogGlobal = firstOrThrow(
    await admin
      .insert(auditLogs)
      .values({ tenantId: null, actorType: "superadmin", action: "test-global", resourceType: "test" })
      .returning({ id: auditLogs.id }),
  );
  auditLogGlobalId = auditLogGlobal.id;
}, 30_000);

afterAll(async () => {
  const root = getRootDb();
  const admin = getAdminDb();
  await admin.delete(auditLogs).where(isNull(auditLogs.tenantId)); // fora do cascade (tenant_id já é null) e fora do alcance de parciva_app
  await root.delete(tenants).where(eq(tenants.id, tenantAId));
  await root.delete(tenants).where(eq(tenants.id, tenantBId));
  await root.delete(plans).where(eq(plans.id, planId));
});

describe("isolamento cross-tenant — memberships", () => {
  it("sessão do tenant A só enxerga a própria membership no SELECT geral", async () => {
    const ctxA = { tenantId: tenantAId };
    const rows = await getDb(ctxA, (db) => db.select({ id: memberships.id }).from(memberships));
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(membershipAId);
    expect(ids).not.toContain(membershipBId);
  });

  it("sessão do tenant A não enxerga a membership do tenant B mesmo pelo id direto", async () => {
    const ctxA = { tenantId: tenantAId };
    const rows = await getDb(ctxA, (db) =>
      db.select({ id: memberships.id }).from(memberships).where(eq(memberships.id, membershipBId)),
    );
    expect(rows).toHaveLength(0);
  });

  it("banco recusa INSERT em memberships com tenant_id que não bate com app.tenant_id", async () => {
    const ctxA = { tenantId: tenantAId };
    await expect(
      getDb(ctxA, (db) =>
        db.insert(memberships).values({ tenantId: tenantBId, userId: userAId, role: "viewer" }),
      ),
    ).rejects.toThrow();
  });
});

/**
 * `self_membership_lookup` (0010_membership_self_lookup_rls.sql) —
 * resolve "login não sabe pra qual tenant redirecionar" sem bypassar
 * RLS. userA pertence a tenantA E tenantB (fixture acima); userB só a
 * tenantB — o teste de vazamento cruzado depende dessa assimetria.
 */
describe("self_membership_lookup — policy de bootstrap do login", () => {
  it("listMembershipsForUser(userA) enxerga as próprias memberships nos DOIS tenants", async () => {
    const result = await listMembershipsForUser(userAId);
    const tenantIds = result.map((r) => r.tenantId);
    expect(tenantIds).toContain(tenantAId);
    expect(tenantIds).toContain(tenantBId);
    expect(result).toHaveLength(2);
  });

  it("listMembershipsForUser(userB) não enxerga a membership de userA no mesmo tenant B", async () => {
    const result = await listMembershipsForUser(userBId);
    const ids = result.map((r) => r.tenantId);
    expect(ids).toEqual([tenantBId]);
  });

  it("getUserDb(userA) via SELECT direto não retorna a membership de userB", async () => {
    const rows = await getUserDb(userAId, (db) =>
      db.select({ id: memberships.id }).from(memberships).where(eq(memberships.id, membershipBId)),
    );
    expect(rows).toHaveLength(0);
  });

  it("self_membership_lookup é só para SELECT — INSERT sob getUserDb (sem app.tenant_id) continua bloqueado", async () => {
    await expect(
      getUserDb(userAId, (db) =>
        db.insert(memberships).values({ tenantId: tenantAId, userId: userAId, role: "admin" }),
      ),
    ).rejects.toThrow();
  });
});

describe("isolamento cross-tenant — subscriptions", () => {
  it("sessão do tenant A só enxerga a própria assinatura no SELECT geral", async () => {
    const ctxA = { tenantId: tenantAId };
    const rows = await getDb(ctxA, (db) => db.select({ id: subscriptions.id }).from(subscriptions));
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(subscriptionAId);
    expect(ids).not.toContain(subscriptionBId);
  });

  it("sessão do tenant A não enxerga a assinatura do tenant B mesmo pelo id direto", async () => {
    const ctxA = { tenantId: tenantAId };
    const rows = await getDb(ctxA, (db) =>
      db.select({ id: subscriptions.id }).from(subscriptions).where(eq(subscriptions.id, subscriptionBId)),
    );
    expect(rows).toHaveLength(0);
  });

  it("banco recusa INSERT em subscriptions com tenant_id que não bate com app.tenant_id", async () => {
    const ctxA = { tenantId: tenantAId };
    const now = new Date();
    await expect(
      getDb(ctxA, (db) =>
        db.insert(subscriptions).values({
          tenantId: tenantBId,
          planId,
          provider: "manual",
          currentPeriodStart: now,
          currentPeriodEnd: now,
        }),
      ),
    ).rejects.toThrow();
  });
});

describe("isolamento cross-tenant — usage_counters", () => {
  it("sessão do tenant A só enxerga o próprio contador no SELECT geral", async () => {
    const ctxA = { tenantId: tenantAId };
    const rows = await getDb(ctxA, (db) => db.select({ id: usageCounters.id }).from(usageCounters));
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(usageCounterAId);
    expect(ids).not.toContain(usageCounterBId);
  });

  it("sessão do tenant A não enxerga o contador do tenant B mesmo pelo id direto", async () => {
    const ctxA = { tenantId: tenantAId };
    const rows = await getDb(ctxA, (db) =>
      db.select({ id: usageCounters.id }).from(usageCounters).where(eq(usageCounters.id, usageCounterBId)),
    );
    expect(rows).toHaveLength(0);
  });

  it("banco recusa INSERT em usage_counters com tenant_id que não bate com app.tenant_id", async () => {
    const ctxA = { tenantId: tenantAId };
    await expect(
      getDb(ctxA, (db) =>
        db.insert(usageCounters).values({
          tenantId: tenantBId,
          periodStart: new Date(),
          metric: "receipts_per_month",
        }),
      ),
    ).rejects.toThrow();
  });
});

describe("isolamento cross-tenant — audit_logs", () => {
  it("sessão do tenant A só enxerga o próprio log no SELECT geral", async () => {
    const ctxA = { tenantId: tenantAId };
    const rows = await getDb(ctxA, (db) => db.select({ id: auditLogs.id }).from(auditLogs));
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(auditLogAId);
    expect(ids).not.toContain(auditLogBId);
  });

  it("sessão do tenant A não enxerga o log do tenant B mesmo pelo id direto", async () => {
    const ctxA = { tenantId: tenantAId };
    const rows = await getDb(ctxA, (db) =>
      db.select({ id: auditLogs.id }).from(auditLogs).where(eq(auditLogs.id, auditLogBId)),
    );
    expect(rows).toHaveLength(0);
  });

  it("banco recusa INSERT em audit_logs com tenant_id que não bate com app.tenant_id", async () => {
    const ctxA = { tenantId: tenantAId };
    await expect(
      getDb(ctxA, (db) =>
        db.insert(auditLogs).values({
          tenantId: tenantBId,
          actorType: "user",
          action: "test-intruso",
          resourceType: "test",
        }),
      ),
    ).rejects.toThrow();
  });

  // Única das 13 tabelas com tenant_id nullable (ações globais do
  // superadmin, spec §12) — 0001_rls.sql comenta explicitamente que essa
  // linha só deveria ser visível via getAdminDb() (BYPASSRLS), nunca por
  // sessão de tenant. `tenant_id = current_setting(...)::uuid` nunca
  // casa com NULL, então isso já devia funcionar por construção — este
  // teste é o que prova, não só documenta.
  it("sessão de tenant nenhuma enxerga log global (tenant_id NULL) — nem A nem B", async () => {
    const ctxA = { tenantId: tenantAId };
    const ctxB = { tenantId: tenantBId };
    const rowsA = await getDb(ctxA, (db) =>
      db.select({ id: auditLogs.id }).from(auditLogs).where(eq(auditLogs.id, auditLogGlobalId)),
    );
    const rowsB = await getDb(ctxB, (db) =>
      db.select({ id: auditLogs.id }).from(auditLogs).where(eq(auditLogs.id, auditLogGlobalId)),
    );
    expect(rowsA).toHaveLength(0);
    expect(rowsB).toHaveLength(0);
  });

  it("bypass de RLS (getAdminDb, o mecanismo real do superadmin) enxerga o log global", async () => {
    const admin = getAdminDb();
    const rows = await admin
      .select({ id: auditLogs.id })
      .from(auditLogs)
      .where(eq(auditLogs.id, auditLogGlobalId));
    expect(rows).toHaveLength(1);
  });
});
