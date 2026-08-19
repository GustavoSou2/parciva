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
import { logger } from "@/shared/logger";
import { sendEmail } from "@/shared/email";
import type { PlanLimits } from "@/modules/billing";
import { createMembership, createUser, type MembershipRole } from "@/modules/identity";
import type { NewTenant, NewUser } from "../application/create-tenant";
import type { TenantStatus } from "../domain/types";

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

/** Usado só pelo cron de renovação de assinatura (`billing/application/renew-subscriptions.ts`) — precisa enumerar todo tenant sem nenhum `tenantId` prévio, mesmo motivo de `tenants` ser tabela raiz. */
export async function listTenantIds(): Promise<string[]> {
  const rows = await getRootDb().select({ id: tenants.id }).from(tenants);
  return rows.map((row) => row.id);
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

/** Usado pelo webhook de cobrança (`billing/application/handle-billing-webhook.ts`) pra saber a partir de qual estado transicionar. */
export async function getTenantStatus(tenantId: string): Promise<TenantStatus | null> {
  const rows = await getRootDb().select({ status: tenants.status }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  return rows[0]?.status ?? null;
}

/**
 * `suspendedAt` (coluna existente desde a fundação, nunca escrita até o
 * cron de dunning) é gravado aqui sempre que o novo status é
 * `"suspended"` — vale tanto pra suspensão automática (`payment_overdue`)
 * quanto pra uma futura suspensão manual (`admin_suspend`), sem precisar
 * de um segundo ponto de escrita.
 */
export async function setTenantStatus(tenantId: string, status: TenantStatus): Promise<void> {
  const now = new Date();
  await getRootDb()
    .update(tenants)
    .set({ status, updatedAt: now, ...(status === "suspended" ? { suspendedAt: now } : {}) })
    .where(eq(tenants.id, tenantId));
}

export interface TenantBillingSummary {
  readonly name: string;
  readonly cnpj: string | null;
  readonly status: TenantStatus;
  readonly planCode: string | null;
}

/** Usado por `/t/[tenantSlug]/account` (Fase 4) pra mostrar plano/CNPJ atuais sem expor mais do que isso da tabela raiz `tenants`. */
export async function getTenantBillingSummary(tenantId: string): Promise<TenantBillingSummary | null> {
  const rows = await getRootDb()
    .select({ name: tenants.name, cnpj: tenants.cnpj, status: tenants.status, planCode: plans.code })
    .from(tenants)
    .leftJoin(plans, eq(tenants.planId, plans.id))
    .where(eq(tenants.id, tenantId))
    .limit(1);
  return rows[0] ?? null;
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

/**
 * Provedor real (Resend, `@/shared/email.ts`) desde 19/08/2026 — antes
 * só logava o link (dev). Loga sempre, mesmo com envio real
 * configurado: é a única forma de testar o fluxo sem depender da
 * entrega chegar numa caixa de entrada real, e sem conta Resend criada
 * ainda (pendência, DECISIONS.md) é a ÚNICA confirmação disponível.
 * `create-tenant.ts` já trata isto como best-effort (try/catch) — não
 * precisa de outro aqui.
 */
export async function sendWelcomeEmail(email: string, name: string): Promise<void> {
  logger.info("e-mail de boas-vindas", { name, email });
  await sendEmail({
    to: email,
    subject: "Bem-vindo à Parciva",
    html: `<p>Olá, ${name}!</p><p>Sua conta na Parciva foi criada com sucesso.</p>`,
  });
}
