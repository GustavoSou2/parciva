/**
 * `memberships` TEM RLS (0001_rls.sql) — diferente de `users`/`sessions`/
 * `invite_tokens`, não é tabela raiz. Isso cria um problema de bootstrap
 * específico em `getMembership`: resolver se um usuário tem acesso a um
 * tenant, a partir só do slug (antes de qualquer `TenantContext`
 * existir). Resolvido em duas etapas: (1) `tenants.slug` → `tenantId`
 * via `getRootDb()` (tenants É raiz); (2) com esse `tenantId` candidato
 * em mãos, consulta `memberships` via `getDb({tenantId}, ...)` — a RLS
 * então enxerga exatamente a fatia certa pra confirmar (ou não) que o
 * usuário pertence a ela. Nunca usa `getRootDb()` em `memberships`
 * (RLS bloquearia tudo, já que o role da app não é superusuário — ver
 * DECISIONS.md [13]).
 */

import { and, eq, isNotNull } from "drizzle-orm";
import { getDb, getRootDb, type TenantContext } from "@/db/client";
import { memberships, tenants } from "@/db/schema/tenancy";
import type { MembershipRole } from "../domain/types";

export interface ResolvedMembership {
  readonly tenantId: string;
  readonly role: MembershipRole;
}

export async function getMembership(
  userId: string,
  tenantSlug: string,
): Promise<ResolvedMembership | null> {
  const tenantRows = await getRootDb()
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.slug, tenantSlug))
    .limit(1);
  const tenant = tenantRows[0];
  if (!tenant) return null;

  const ctx: TenantContext = { tenantId: tenant.id };
  const rows = await getDb(ctx, (db) =>
    db
      .select({ role: memberships.role })
      .from(memberships)
      .where(
        and(
          eq(memberships.tenantId, tenant.id),
          eq(memberships.userId, userId),
          isNotNull(memberships.acceptedAt),
        ),
      )
      .limit(1),
  );
  const membership = rows[0];
  return membership ? { tenantId: tenant.id, role: membership.role } : null;
}

export async function membershipExists(ctx: TenantContext, userId: string): Promise<boolean> {
  const rows = await getDb(ctx, (db) =>
    db
      .select({ id: memberships.id })
      .from(memberships)
      .where(and(eq(memberships.tenantId, ctx.tenantId), eq(memberships.userId, userId)))
      .limit(1),
  );
  return rows.length > 0;
}

export async function createMembership(
  ctx: TenantContext,
  userId: string,
  role: MembershipRole,
  invitedBy: string | null,
  acceptedAt: Date | null = null,
): Promise<void> {
  await getDb(ctx, (db) =>
    db.insert(memberships).values({
      tenantId: ctx.tenantId,
      userId,
      role,
      invitedBy,
      acceptedAt,
    }),
  );
}

/** Aceita convite — grava `accepted_at`. `ctx` vem do próprio `invite_tokens.tenantId` (não exige sessão prévia). */
export async function acceptMembership(ctx: TenantContext, userId: string): Promise<void> {
  await getDb(ctx, (db) =>
    db
      .update(memberships)
      .set({ acceptedAt: new Date() })
      .where(and(eq(memberships.tenantId, ctx.tenantId), eq(memberships.userId, userId))),
  );
}
