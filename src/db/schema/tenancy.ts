/**
 * Núcleo de identidade e tenancy — spec §5.1.
 *
 * Toda tabela aqui tem tenant_id (exceto `tenants` e `users`, que são a
 * raiz) e é protegida por Row Level Security aplicada na migração SQL
 * manual (0001_rls.sql), não neste arquivo — Drizzle gera DDL de tabela,
 * não de policy.
 */

import { relations } from "drizzle-orm";
import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const tenantStatusEnum = pgEnum("tenant_status", [
  "trial",
  "active",
  "past_due",
  "suspended",
  "cancelled",
  "purged",
]);

export const membershipRoleEnum = pgEnum("membership_role", [
  "owner",
  "admin",
  "operator",
  "viewer",
]);

export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  cnpj: text("cnpj"), // texto — pode ser alfanumérico, ver shared/document.ts
  slug: text("slug").notNull(),
  status: tenantStatusEnum("status").notNull().default("trial"),
  planId: uuid("plan_id").references(() => plans.id),
  timezone: text("timezone").notNull().default("America/Sao_Paulo"),
  settings: jsonb("settings").notNull().default({}),
  // Id do CLIENTE na AbacatePay (Parciva cobrando o TENANT pela própria
  // assinatura do SaaS) — nunca confundir com `psp_connections` (Modelo
  // B, invariante 8/9: cobrança dos PAGADORES de um tenant, na conta do
  // PSP do próprio tenant). Isto aqui é receita do Parciva, não custódia
  // de terceiro.
  billingCustomerRef: text("billing_customer_ref"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  suspendedAt: timestamp("suspended_at", { withTimezone: true }),
  purgedAt: timestamp("purged_at", { withTimezone: true }),
}, (t) => ({
  slugUnique: uniqueIndex("tenants_slug_unique").on(t.slug),
}));

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  name: text("name").notNull(),
  passwordHash: text("password_hash"), // null quando o login é só SSO
  mfaEnabled: boolean("mfa_enabled").notNull().default(false),
  mfaSecretRef: text("mfa_secret_ref"), // ponteiro para o cofre, nunca o segredo em claro
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  emailUnique: uniqueIndex("users_email_unique").on(t.email),
}));

/**
 * Sessão de login — spec §3.1 ("sessões no Postgres próprio", não JWT
 * stateless: revogável, auditável). `id` é o HASH SHA-256 do token —
 * o token bruto nunca é persistido, só existe no cookie do navegador
 * (mesmo raciocínio de `hashTransactionRef` em `reconciliation/infra/
 * payment-repository.ts`: um vazamento do banco não deveria bastar pra
 * sequestrar sessão de ninguém). Tabela raiz — resolver sessão é
 * exatamente o problema de bootstrap que tira `whatsapp_channels` da
 * RLS (ver comentário lá): não existe `tenantId` até o cookie virar um
 * `userId`.
 */
export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(), // hash do token, não o token
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  userAgent: text("user_agent"),
  ip: text("ip"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

/**
 * Token de convite — ativa uma `membership` criada com `accepted_at:
 * null` (ver comentário em `memberships` abaixo). `id` é hash do token,
 * mesmo raciocínio de `sessions`. Também raiz: quem abre o link ainda
 * não tem sessão nem tenant resolvido.
 */
export const inviteTokens = pgTable("invite_tokens", {
  id: text("id").primaryKey(), // hash do token, não o token
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

/**
 * Token de "esqueci minha senha" — mesmo raciocínio de `invite_tokens`
 * (`id` é hash, não o token bruto), mas sem `tenant_id`: reset de senha
 * não é por tenant, é por usuário. Também raiz — resolver o token
 * precisa acontecer antes de existir sessão ou tenant.
 */
export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: text("id").primaryKey(), // hash do token, não o token
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

/**
 * Une usuário a tenant com um papel. É esta tabela que a RLS de
 * `memberships` e as policies das tabelas de domínio consultam para
 * decidir se um usuário pode agir num tenant — ver 0001_rls.sql.
 *
 * Convite (spec §14 Fase 0) não é uma entidade separada: é esta linha
 * criada com `accepted_at: null` + um `invite_tokens` correspondente —
 * aceitar o convite define a senha do usuário e marca `accepted_at`.
 */
export const memberships = pgTable("memberships", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: membershipRoleEnum("role").notNull(),
  invitedBy: uuid("invited_by").references(() => users.id),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  tenantUserUnique: uniqueIndex("memberships_tenant_user_unique").on(t.tenantId, t.userId),
}));

export const plans = pgTable("plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  priceCents: integer("price_cents").notNull(), // centavos inteiros — invariante 1; conversão para exibição via shared/money.ts
  currency: text("currency").notNull().default("BRL"),
  interval: text("interval").notNull().default("month"),
  limits: jsonb("limits").notNull().default({}),
  features: jsonb("features").notNull().default({}),
  isPublic: boolean("is_public").notNull().default(true),
  // Id do "produto" correspondente na AbacatePay — `checkouts/create`
  // (v2) exige um produto pré-cadastrado (`items: [{id, quantity}]`),
  // diferente do `/billing/create` v1 (produto inline, não usado aqui —
  // essa chave de API é v2, achado confirmado empiricamente contra o
  // ambiente de dev). Nulo pra `free`/`scale` — só planos cobrados
  // automaticamente (essential/professional) precisam.
  abacatePayProductId: text("abacate_pay_product_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  codeUnique: uniqueIndex("plans_code_unique").on(t.code),
}));

export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  planId: uuid("plan_id").notNull().references(() => plans.id),
  provider: text("provider").notNull(), // ex.: 'asaas', 'pagarme'
  providerRef: text("provider_ref"),
  status: text("status").notNull().default("active"),
  currentPeriodStart: timestamp("current_period_start", { withTimezone: true }).notNull(),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }).notNull(),
  cancelAt: timestamp("cancel_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const invoiceStatusEnum = pgEnum("invoice_status", ["pending", "paid", "failed", "refunded"]);

/**
 * Histórico de cobrança do Parciva↔tenant (spec §13.2 tela 7, "faturas") —
 * distinto de `subscriptions`, que guarda só a linha "atual" por tenant
 * (sobrescrita a cada ciclo, nunca histórico de verdade apesar do
 * comentário abaixo dizer o contrário). Uma linha por cobrança PIX
 * gerada (`billing/application/subscribe-tenant.ts`), atualizada quando
 * o webhook da AbacatePay confirma/reembolsa/disputa
 * (`handle-billing-webhook.ts`). `planCode` é denormalizado de propósito
 * — a fatura mostra o plano de QUANDO foi cobrada, não o plano atual do
 * tenant.
 */
export const invoices = pgTable("invoices", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  planCode: text("plan_code").notNull(),
  providerRef: text("provider_ref").notNull(), // id do checkout na AbacatePay
  amountCents: integer("amount_cents").notNull(),
  status: invoiceStatusEnum("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  paidAt: timestamp("paid_at", { withTimezone: true }),
}, (t) => ({
  providerRefUnique: uniqueIndex("invoices_provider_ref_unique").on(t.providerRef),
}));

export const usageCounters = pgTable("usage_counters", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
  metric: text("metric").notNull(), // ex.: 'receipts_per_month'
  value: text("value").notNull().default("0"),
  limitSnapshot: text("limit_snapshot"),
}, (t) => ({
  tenantPeriodMetricUnique: uniqueIndex("usage_counters_tenant_period_metric_unique").on(
    t.tenantId,
    t.periodStart,
    t.metric,
  ),
}));

export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "set null" }),
  actorType: text("actor_type").notNull(), // 'system' | 'user' | 'api' | 'superadmin'
  actorId: text("actor_id"),
  action: text("action").notNull(),
  resourceType: text("resource_type").notNull(),
  resourceId: text("resource_id"),
  before: jsonb("before"),
  after: jsonb("after"),
  ip: text("ip"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const tenantsRelations = relations(tenants, ({ many, one }) => ({
  memberships: many(memberships),
  plan: one(plans, { fields: [tenants.planId], references: [plans.id] }),
}));

export const usersRelations = relations(users, ({ many }) => ({
  memberships: many(memberships),
  sessions: many(sessions),
}));

export const membershipsRelations = relations(memberships, ({ one }) => ({
  tenant: one(tenants, { fields: [memberships.tenantId], references: [tenants.id] }),
  user: one(users, { fields: [memberships.userId], references: [users.id] }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const inviteTokensRelations = relations(inviteTokens, ({ one }) => ({
  user: one(users, { fields: [inviteTokens.userId], references: [users.id] }),
  tenant: one(tenants, { fields: [inviteTokens.tenantId], references: [tenants.id] }),
}));
