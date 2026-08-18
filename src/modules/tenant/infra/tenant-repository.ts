/**
 * Primeira infra real de `tenant` — implementa os `deps` que
 * `application/create-tenant.ts` já declarava. `tenants`/`plans` são
 * tabelas raiz (spec §5.1) — sempre via `getRootDb()`, nunca
 * `getDb(ctx, ...)` (criar o primeiro tenant não tem `tenantId` ainda,
 * mesmo raciocínio de `whatsapp_channels`/`users`).
 *
 * `saveUser`/`saveMembership` delegam pro `identity` público (`create
 * User`/`createMembership`) em vez de reimplementar — évita duas cópias
 * da mesma lógica de escrita em `users`/`memberships`.
 */

import { eq } from "drizzle-orm";
import { getRootDb, type TenantContext } from "@/db/client";
import { plans, tenants } from "@/db/schema/tenancy";
import { money, type Money } from "@/shared/money";
import type { PlanLimits } from "@/modules/billing";
import { createMembership, createUser, type MembershipRole } from "@/modules/identity";
import type { NewTenant, NewUser } from "../application/create-tenant";

/** Padrão sugerido pela spec §6.6 quando o tenant não configurou nada em `settings`. */
const DEFAULT_AUTO_APPROVAL_CEILING_CENTS = money(500_000);

/**
 * Teto de auto-aplicação de comprovante (spec §6.6) — mora em
 * `tenants.settings` (jsonb) porque é a única configuração desse tipo
 * até agora; não justifica coluna própria. `tenants` é tabela raiz
 * (sem `tenant_id`, é o próprio tenant) — `getRootDb()`, mesmo padrão
 * do resto deste arquivo.
 */
export async function getAutoApprovalCeilingCents(tenantId: string): Promise<Money> {
  const rows = await getRootDb().select({ settings: tenants.settings }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  const settings = rows[0]?.settings as { autoApprovalCeilingCents?: number } | undefined;
  const raw = settings?.autoApprovalCeilingCents;
  return typeof raw === "number" ? money(raw) : DEFAULT_AUTO_APPROVAL_CEILING_CENTS;
}

export async function slugExists(slug: string): Promise<boolean> {
  const rows = await getRootDb().select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, slug)).limit(1);
  return rows.length > 0;
}

/** Usado por `accept-invite`/`login` pra saber pra qual URL de tenant redirecionar depois — `tenants` é raiz, leitura simples. */
export async function getTenantSlugById(tenantId: string): Promise<string | null> {
  const rows = await getRootDb().select({ slug: tenants.slug }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  return rows[0]?.slug ?? null;
}

export async function getPlanLimits(planCode: string): Promise<PlanLimits | null> {
  const rows = await getRootDb().select({ limits: plans.limits }).from(plans).where(eq(plans.code, planCode)).limit(1);
  const row = rows[0];
  return row ? (row.limits as PlanLimits) : null;
}

export async function saveTenant(data: NewTenant): Promise<{ tenantId: string }> {
  const planRows = await getRootDb().select({ id: plans.id }).from(plans).where(eq(plans.code, data.planCode)).limit(1);
  const plan = planRows[0];
  if (!plan) throw new Error(`Plano '${data.planCode}' não encontrado — chamado sem getPlanLimits ter validado antes?`);

  const [row] = await getRootDb()
    .insert(tenants)
    .values({ name: data.name, slug: data.slug, status: data.status, planId: plan.id })
    .returning({ id: tenants.id });
  if (!row) throw new Error("Insert de tenant não retornou linha — não deveria acontecer.");
  return { tenantId: row.id };
}

export async function saveUser(data: NewUser): Promise<{ userId: string }> {
  return createUser({ email: data.email, name: data.name, passwordHash: data.passwordHash });
}

/** Owner de signup self-service — `acceptedAt` já vem preenchido (quem assina o tenant não passa por convite). */
export async function saveMembership(
  tenantId: string,
  userId: string,
  role: MembershipRole,
): Promise<void> {
  const ctx: TenantContext = { tenantId };
  await createMembership(ctx, userId, role, null, new Date());
}

export function sendWelcomeEmail(email: string, name: string): Promise<void> {
  // Sem provedor de e-mail configurado no projeto ainda (mesma situação
  // do convite, ver identity/application/invite-user.ts) — loga em vez
  // de enviar, pronto pra plugar um provedor depois.
  console.log(`[tenant] e-mail de boas-vindas (stub, não enviado de verdade) para ${name} <${email}>`);
  return Promise.resolve();
}
