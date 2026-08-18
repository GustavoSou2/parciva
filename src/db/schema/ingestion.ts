/**
 * Ingestão de comprovantes e canal WhatsApp — spec §5.3/§5.4. Escopo
 * desta fatia (ver docs/tasks — tarefa "conectar ingestão ao banco"):
 * só as tabelas necessárias para persistir o resultado da cascata de
 * extração e fazer dedupe real de webhook. `fraud_checks`,
 * `reconciliation_proposals`, `api_keys`, `webhook_endpoints`,
 * `webhook_deliveries` e `idempotency_keys` ficam para quando os
 * módulos que as usam (fraud, reconciliation, API pública — Fase 7)
 * existirem.
 *
 * `whatsapp_channels` é a única tabela deste arquivo tratada como
 * tabela RAIZ (sem tenant_id na RLS) — resolver o tenant a partir do
 * número Twilio (`phone_number_id`) precisa acontecer ANTES de existir
 * um `tenantId` para o `SET LOCAL app.tenant_id` (mesmo problema de
 * bootstrap que já tira `tenants`/`users`/`plans` da RLS, ver
 * src/db/schema/tenancy.ts e src/db/migrations/0001_rls.sql).
 */

import { relations } from "drizzle-orm";
import {
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { tenants } from "./tenancy";

// Espelha ReceiptSource (src/modules/ingestion/domain/types.ts) — não duplicar a lista à mão.
export const receiptSourceEnum = pgEnum("receipt_source", ["whatsapp", "upload", "email", "api"]);

export const receiptStatusEnum = pgEnum("receipt_status", [
  "received",
  "processing",
  "extracted",
  "matched",
  "applied",
  "review",
  "rejected",
  "failed",
]);

// Espelha ExtractionTier (src/modules/ingestion/domain/types.ts) — inclui "ocr",
// que a lista da spec §5.3 não tem; o tipo real do código é a fonte da verdade.
export const extractionTierEnum = pgEnum("extraction_tier", [
  "cache",
  "deterministic",
  "ocr",
  "vlm_cheap",
  "vlm_premium",
  "human",
]);

export const inboundMessageKindEnum = pgEnum("inbound_message_kind", ["media", "text"]);

export const receipts = pgTable(
  "receipts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    source: receiptSourceEnum("source").notNull(),
    storageKey: text("storage_key").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    contentHash: text("content_hash").notNull(),
    // pHash (recorte/recompressão) — coluna prevista pela spec, ainda não computada (Tier 0 é trabalho futuro).
    perceptualHash: text("perceptual_hash"),
    status: receiptStatusEnum("status").notNull().default("received"),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (t) => ({
    tenantContentHashUnique: uniqueIndex("receipts_tenant_content_hash_unique").on(
      t.tenantId,
      t.contentHash,
    ),
  }),
);

export const receiptExtractions = pgTable("receipt_extractions", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  receiptId: uuid("receipt_id").notNull().references(() => receipts.id, { onDelete: "cascade" }),
  attempt: integer("attempt").notNull().default(1),
  tier: extractionTierEnum("tier").notNull(),
  provider: text("provider"),
  model: text("model"),
  promptVersion: text("prompt_version"),
  data: jsonb("data").notNull(), // ExtractionOutput completo (src/modules/ingestion/domain/types.ts)
  fieldConfidence: jsonb("field_confidence").notNull().default({}),
  overallConfidence: numeric("overall_confidence").notNull(),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  costMicros: integer("cost_micros"),
  latencyMs: integer("latency_ms"),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Tabela raiz — SEM tenant_id na RLS (ver comentário no topo do arquivo).
 * `phoneNumberId` é a chave usada para resolver o tenant a partir do
 * `To` do webhook Twilio, antes de qualquer TenantContext existir.
 */
export const whatsappChannels = pgTable(
  "whatsapp_channels",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    provider: text("provider").notNull().default("twilio"),
    phoneNumberId: text("phone_number_id").notNull(),
    displayNumber: text("display_number").notNull(),
    // ponteiro pro cofre, nunca o segredo (invariante 7) — nullable: sem onboarding por tenant ainda (DECISIONS.md [11]).
    credentialsRef: text("credentials_ref"),
    status: text("status").notNull().default("active"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    phoneNumberIdUnique: uniqueIndex("whatsapp_channels_phone_number_id_unique").on(
      t.phoneNumberId,
    ),
  }),
);

export const inboundMessages = pgTable(
  "inbound_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    channelId: uuid("channel_id").notNull().references(() => whatsappChannels.id),
    providerMessageId: text("provider_message_id").notNull(), // MessageSid do Twilio
    kind: inboundMessageKindEnum("kind").notNull(),
    body: text("body"),
    // NULL nesta fatia — ligar receipt_id exigiria reordenar a geração do
    // receiptId no webhook; não é necessário para o dedupe funcionar.
    receiptId: uuid("receipt_id").references(() => receipts.id),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (t) => ({
    tenantProviderMessageIdUnique: uniqueIndex(
      "inbound_messages_tenant_provider_message_id_unique",
    ).on(t.tenantId, t.providerMessageId),
  }),
);

export const receiptsRelations = relations(receipts, ({ many }) => ({
  extractions: many(receiptExtractions),
}));

export const receiptExtractionsRelations = relations(receiptExtractions, ({ one }) => ({
  receipt: one(receipts, { fields: [receiptExtractions.receiptId], references: [receipts.id] }),
}));

export const whatsappChannelsRelations = relations(whatsappChannels, ({ many }) => ({
  inboundMessages: many(inboundMessages),
}));

export const inboundMessagesRelations = relations(inboundMessages, ({ one }) => ({
  channel: one(whatsappChannels, {
    fields: [inboundMessages.channelId],
    references: [whatsappChannels.id],
  }),
  receipt: one(receipts, { fields: [inboundMessages.receiptId], references: [receipts.id] }),
}));
