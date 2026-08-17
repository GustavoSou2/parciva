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
 * Une usuário a tenant com um papel. É esta tabela que a RLS de
 * `memberships` e as policies das tabelas de domínio consultam para
 * decidir se um usuário pode agir num tenant — ver 0001_rls.sql.
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
}));

export const membershipsRelations = relations(memberships, ({ one }) => ({
  tenant: one(tenants, { fields: [memberships.tenantId], references: [tenants.id] }),
  user: one(users, { fields: [memberships.userId], references: [users.id] }),
}));
