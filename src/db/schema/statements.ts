/**
 * Conciliação por extrato — Fase 5 (fatia 2, spec §8.1 Camada D,
 * 19/08/2026). Uma linha em `statement_imports` por upload de CSV;
 * `statement_lines` guarda cada linha de crédito do arquivo (débito é
 * descartado no parse — só crédito importa pra casar com pagamento
 * recebido, ver `@/modules/statements`). `matched_payment_id` referencia
 * `payments` (financial.ts) — nunca o contrário, mesmo padrão de
 * `reconciliation_proposals.payment_id`.
 */

import { relations } from "drizzle-orm";
import { integer, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { tenants, users } from "./tenancy";
import { payments } from "./financial";

export const statementMatchKindEnum = pgEnum("statement_match_kind", ["auto_e2e", "manual"]);

export const statementImports = pgTable("statement_imports", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  filename: text("filename").notNull(),
  uploadedBy: uuid("uploaded_by").notNull().references(() => users.id),
  lineCount: integer("line_count").notNull(),
  matchedCount: integer("matched_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const statementLines = pgTable("statement_lines", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  statementImportId: uuid("statement_import_id")
    .notNull()
    .references(() => statementImports.id, { onDelete: "cascade" }),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  description: text("description").notNull(),
  amountCents: integer("amount_cents").notNull(),
  // E2E id achado na descrição (Camada D casa por E2E, spec §8.1) — null quando nenhum foi reconhecido.
  extractedRef: text("extracted_ref"),
  // null = sem match. "auto_e2e" (extractedRef bateu num payment existente) ou "manual" (humano criou o pagamento a partir da linha).
  matchKind: statementMatchKindEnum("match_kind"),
  matchedPaymentId: uuid("matched_payment_id").references(() => payments.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const statementImportsRelations = relations(statementImports, ({ many }) => ({
  lines: many(statementLines),
}));

export const statementLinesRelations = relations(statementLines, ({ one }) => ({
  statementImport: one(statementImports, {
    fields: [statementLines.statementImportId],
    references: [statementImports.id],
  }),
}));
