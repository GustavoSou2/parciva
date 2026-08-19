/**
 * Domínio financeiro — spec §5.2. Toda coluna de dinheiro é `integer`
 * (centavos inteiros, CLAUDE.md invariante 1) — nunca `numeric`, nunca
 * `text`, nunca float. Toda tabela tem `tenant_id NOT NULL` referenciando
 * `tenants` (invariante 3); RLS é aplicada em SQL manual
 * (0001_rls.sql), não neste arquivo.
 *
 * `charges`, `charge_installments` e `psp_connections` (modelo B) entram
 * vazias agora e só passam a ser usadas na Fase 6 — spec §2.5 e §6.2.
 */

import { relations } from "drizzle-orm";
import {
  bigserial,
  date,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { tenants, users } from "./tenancy";
import { receipts } from "./ingestion";

export const documentTypeEnum = pgEnum("document_type", ["cpf", "cnpj", "none"]);

export const earlyPaymentPolicyEnum = pgEnum("early_payment_policy", [
  "reduce_count",
  "reduce_amount",
  "credit_balance",
]);

export const installmentStatusEnum = pgEnum("installment_status", [
  "pending",
  "partial",
  "paid",
  "overdue",
  "cancelled",
  "written_off",
]);

// Modelo A vs B (CLAUDE.md invariante 9) — todo payment sabe de onde veio.
export const paymentOriginEnum = pgEnum("payment_origin", [
  "receipt",
  "psp_webhook",
  "statement",
  "manual",
  "api",
]);

export const verificationLevelEnum = pgEnum("verification_level", [
  "unverified",
  "document",
  "statement",
  "psp_confirmed",
]);

export const paymentMethodEnum = pgEnum("payment_method", [
  "pix",
  "ted",
  "doc",
  "boleto",
  "cash",
  "card",
  "other",
]);

export const paymentStatusEnum = pgEnum("payment_status", [
  "proposed",
  "applied",
  "reversed",
  "rejected",
]);

export const allocationKindEnum = pgEnum("allocation_kind", [
  "principal",
  "fine",
  "interest",
  "credit",
]);

export const pspConnectionStatusEnum = pgEnum("psp_connection_status", [
  "pending",
  "active",
  "expired",
  "revoked",
]);

export const chargeStatusEnum = pgEnum("charge_status", [
  "draft",
  "active",
  "paid",
  "expired",
  "cancelled",
  "refunded",
]);

export const ledgerDirectionEnum = pgEnum("ledger_direction", ["debit", "credit"]);

export const ledgerActorTypeEnum = pgEnum("ledger_actor_type", ["system", "user", "api"]);

// Marco 4 do roadmap — spec §5.3/§6.6. `reviewed_approved` (Marco 5) é
// distinto de `auto_applied`: o motor decide sozinho no primeiro, um
// humano decide na fila de revisão no segundo — a trilha de auditoria
// (spec §5.3, "log de toda decisão") precisa dizer quem decidiu.
export const reconciliationDecisionEnum = pgEnum("reconciliation_decision", [
  "auto_applied",
  "needs_review",
  "rejected",
  "reviewed_approved",
]);

export const payers = pgTable(
  "payers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    documentType: documentTypeEnum("document_type").notNull().default("none"),
    // Sempre texto — nunca numérico. CNPJ pode conter letras (invariante 10).
    document: varchar("document", { length: 14 }),
    documentHash: text("document_hash"),
    documentMasked: text("document_masked"),
    phoneE164: text("phone_e164"),
    email: text("email"),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantDocumentHashUnique: uniqueIndex("payers_tenant_document_hash_unique").on(
      t.tenantId,
      t.documentHash,
    ),
  }),
);

export const contracts = pgTable(
  "contracts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    payerId: uuid("payer_id").notNull().references(() => payers.id),
    externalRef: text("external_ref"),
    description: text("description"),
    principalCents: integer("principal_cents").notNull(),
    installmentsCount: integer("installments_count").notNull(),
    interestPolicy: jsonb("interest_policy").notNull().default({}),
    earlyPaymentPolicy: earlyPaymentPolicyEnum("early_payment_policy")
      .notNull()
      .default("credit_balance"),
    toleranceCents: integer("tolerance_cents").notNull().default(0),
    startDate: date("start_date").notNull(),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantExternalRefUnique: uniqueIndex("contracts_tenant_external_ref_unique").on(
      t.tenantId,
      t.externalRef,
    ),
  }),
);

export const installments = pgTable(
  "installments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    contractId: uuid("contract_id").notNull().references(() => contracts.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    dueDate: date("due_date").notNull(),
    amountCents: integer("amount_cents").notNull(),
    fineCents: integer("fine_cents").notNull().default(0),
    interestCents: integer("interest_cents").notNull().default(0),
    paidCents: integer("paid_cents").notNull().default(0),
    status: installmentStatusEnum("status").notNull().default("pending"),
    version: integer("version").notNull().default(0), // optimistic locking
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    contractNumberUnique: uniqueIndex("installments_contract_number_unique").on(
      t.contractId,
      t.number,
    ),
  }),
);

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    payerId: uuid("payer_id").notNull().references(() => payers.id),
    origin: paymentOriginEnum("origin").notNull(),
    receiptId: uuid("receipt_id").references(() => receipts.id),
    chargeId: uuid("charge_id").references(() => charges.id),
    verificationLevel: verificationLevelEnum("verification_level").notNull(),
    amountCents: integer("amount_cents").notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true }).notNull(),
    method: paymentMethodEnum("method").notNull(),
    transactionRef: text("transaction_ref"),
    transactionRefHash: text("transaction_ref_hash"),
    status: paymentStatusEnum("status").notNull().default("proposed"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // NULL não conflita em índice único — dedupe (§5.5) só se aplica
    // quando transaction_ref_hash está preenchido.
    tenantTransactionRefHashUnique: uniqueIndex("payments_tenant_transaction_ref_hash_unique").on(
      t.tenantId,
      t.transactionRefHash,
    ),
  }),
);

export const paymentAllocations = pgTable("payment_allocations", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  paymentId: uuid("payment_id").notNull().references(() => payments.id, { onDelete: "cascade" }),
  installmentId: uuid("installment_id").notNull().references(() => installments.id),
  amountCents: integer("amount_cents").notNull(),
  kind: allocationKindEnum("kind").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const creditBalances = pgTable("credit_balances", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  payerId: uuid("payer_id").notNull().references(() => payers.id),
  amountCents: integer("amount_cents").notNull(),
  sourcePaymentId: uuid("source_payment_id").notNull().references(() => payments.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Modelo B — criadas vazias na Fase 1, usadas a partir da Fase 6 ──

export const pspConnections = pgTable("psp_connections", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  accountRef: text("account_ref").notNull(),
  credentialsRef: text("credentials_ref").notNull(), // ponteiro pro cofre, nunca o segredo (invariante 7)
  capabilities: jsonb("capabilities").notNull().default({}),
  status: pspConnectionStatusEnum("status").notNull().default("pending"),
  lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const charges = pgTable(
  "charges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    pspConnectionId: uuid("psp_connection_id").notNull().references(() => pspConnections.id),
    payerId: uuid("payer_id").notNull().references(() => payers.id),
    contractId: uuid("contract_id").notNull().references(() => contracts.id),
    txid: text("txid").notNull(),
    pspChargeId: text("psp_charge_id"),
    amountCents: integer("amount_cents").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    qrPayload: text("qr_payload"),
    qrImageKey: text("qr_image_key"),
    status: chargeStatusEnum("status").notNull().default("draft"),
    targetInstallments: jsonb("target_installments").notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantTxidUnique: uniqueIndex("charges_tenant_txid_unique").on(t.tenantId, t.txid),
  }),
);

export const chargeInstallments = pgTable("charge_installments", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  chargeId: uuid("charge_id").notNull().references(() => charges.id, { onDelete: "cascade" }),
  installmentId: uuid("installment_id").notNull().references(() => installments.id),
  amountCents: integer("amount_cents").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Append-only — CLAUDE.md invariante 2: "ledger_entries é append-only.
 * Nenhum UPDATE, nenhum DELETE. Correção é lançamento de reversão
 * referenciando o original. Protegido por trigger no banco" (ver
 * 0002_ledger_trigger.sql — não confie só na disciplina do código).
 * Por isso não há `updated_at` nem soft-delete aqui: uma linha nunca
 * muda depois de escrita.
 *
 * payer_id/contract_id/installment_id/payment_id ficam nullable porque
 * nem todo entry_type toca as quatro associações (ex.: ajuste de
 * credit_balance não referencia installment).
 */
export const ledgerEntries = pgTable("ledger_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  sequence: bigserial("sequence", { mode: "bigint" }).notNull(),
  entryType: text("entry_type").notNull(),
  payerId: uuid("payer_id").references(() => payers.id),
  contractId: uuid("contract_id").references(() => contracts.id),
  installmentId: uuid("installment_id").references(() => installments.id),
  paymentId: uuid("payment_id").references(() => payments.id),
  amountCents: integer("amount_cents").notNull(),
  direction: ledgerDirectionEnum("direction").notNull(),
  reversesEntryId: uuid("reverses_entry_id"),
  actorType: ledgerActorTypeEnum("actor_type").notNull(),
  actorId: text("actor_id"),
  ruleVersion: text("rule_version").notNull(),
  payload: jsonb("payload").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Log de auditoria da decisão automática vs. revisão (spec §5.3/§6.6) —
 * Marco 4 do roadmap. Uma linha por tentativa de reconciliação de
 * `receipt`, `auto_applied` ou não. `risk_score` (Fase 5, módulo `fraud`,
 * 19/08/2026) só é preenchido quando a proposta passou por
 * `executeReceiptPaymentTx` — fica `NULL` para os casos que nunca chegam
 * lá (sem pagador/contrato identificado, `application/process-receipt-
 * extraction.ts` → `reviewWithoutTarget`).
 */
export const reconciliationProposals = pgTable("reconciliation_proposals", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  receiptId: uuid("receipt_id").notNull().references(() => receipts.id, { onDelete: "cascade" }),
  paymentId: uuid("payment_id").references(() => payments.id),
  proposedAllocations: jsonb("proposed_allocations").notNull().default([]),
  confidence: numeric("confidence").notNull(), // mesmo padrão de receipt_extractions.overall_confidence
  riskScore: numeric("risk_score"),
  decision: reconciliationDecisionEnum("decision").notNull(),
  reviewedBy: uuid("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  reviewNote: text("review_note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const fraudCheckResultEnum = pgEnum("fraud_check_result", ["pass", "warn", "fail"]);

/**
 * Uma linha por check por comprovante avaliado (spec §5.2/§8) — só
 * gravado dentro de `executeReceiptPaymentTx` (`reconciliation/infra/
 * payment-repository.ts`), nunca para comprovante duplicado/quase-
 * duplicado (esses são rejeitados em `ingestion/application/ingest-
 * receipt.ts` ANTES de qualquer `receipts` row existir — sem `receiptId`
 * pra referenciar aqui, design deliberado desde o Marco 5).
 */
export const fraudChecks = pgTable("fraud_checks", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  receiptId: uuid("receipt_id").notNull().references(() => receipts.id, { onDelete: "cascade" }),
  checkCode: text("check_code").notNull(),
  result: fraudCheckResultEnum("result").notNull(),
  weight: numeric("weight").notNull(),
  detail: jsonb("detail"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const payersRelations = relations(payers, ({ many }) => ({
  contracts: many(contracts),
  payments: many(payments),
  creditBalances: many(creditBalances),
  charges: many(charges),
}));

export const contractsRelations = relations(contracts, ({ one, many }) => ({
  payer: one(payers, { fields: [contracts.payerId], references: [payers.id] }),
  installments: many(installments),
  charges: many(charges),
}));

export const installmentsRelations = relations(installments, ({ one, many }) => ({
  contract: one(contracts, { fields: [installments.contractId], references: [contracts.id] }),
  allocations: many(paymentAllocations),
  chargeInstallments: many(chargeInstallments),
}));

export const paymentsRelations = relations(payments, ({ one, many }) => ({
  payer: one(payers, { fields: [payments.payerId], references: [payers.id] }),
  charge: one(charges, { fields: [payments.chargeId], references: [charges.id] }),
  allocations: many(paymentAllocations),
}));

export const paymentAllocationsRelations = relations(paymentAllocations, ({ one }) => ({
  payment: one(payments, { fields: [paymentAllocations.paymentId], references: [payments.id] }),
  installment: one(installments, {
    fields: [paymentAllocations.installmentId],
    references: [installments.id],
  }),
}));

export const creditBalancesRelations = relations(creditBalances, ({ one }) => ({
  payer: one(payers, { fields: [creditBalances.payerId], references: [payers.id] }),
  sourcePayment: one(payments, {
    fields: [creditBalances.sourcePaymentId],
    references: [payments.id],
  }),
}));

export const pspConnectionsRelations = relations(pspConnections, ({ many }) => ({
  charges: many(charges),
}));

export const chargesRelations = relations(charges, ({ one, many }) => ({
  pspConnection: one(pspConnections, {
    fields: [charges.pspConnectionId],
    references: [pspConnections.id],
  }),
  payer: one(payers, { fields: [charges.payerId], references: [payers.id] }),
  contract: one(contracts, { fields: [charges.contractId], references: [contracts.id] }),
  chargeInstallments: many(chargeInstallments),
  payments: many(payments),
}));

export const chargeInstallmentsRelations = relations(chargeInstallments, ({ one }) => ({
  charge: one(charges, { fields: [chargeInstallments.chargeId], references: [charges.id] }),
  installment: one(installments, {
    fields: [chargeInstallments.installmentId],
    references: [installments.id],
  }),
}));

export const ledgerEntriesRelations = relations(ledgerEntries, ({ one, many }) => ({
  payer: one(payers, { fields: [ledgerEntries.payerId], references: [payers.id] }),
  contract: one(contracts, { fields: [ledgerEntries.contractId], references: [contracts.id] }),
  installment: one(installments, {
    fields: [ledgerEntries.installmentId],
    references: [installments.id],
  }),
  payment: one(payments, { fields: [ledgerEntries.paymentId], references: [payments.id] }),
  reversesEntry: one(ledgerEntries, {
    fields: [ledgerEntries.reversesEntryId],
    references: [ledgerEntries.id],
    relationName: "ledgerEntryReversal",
  }),
  reversals: many(ledgerEntries, { relationName: "ledgerEntryReversal" }),
}));

export const reconciliationProposalsRelations = relations(reconciliationProposals, ({ one }) => ({
  receipt: one(receipts, { fields: [reconciliationProposals.receiptId], references: [receipts.id] }),
  payment: one(payments, { fields: [reconciliationProposals.paymentId], references: [payments.id] }),
  reviewer: one(users, { fields: [reconciliationProposals.reviewedBy], references: [users.id] }),
}));
