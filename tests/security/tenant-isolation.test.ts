/**
 * Teste de isolamento cross-tenant — CLAUDE.md marca `pnpm test:tenant`
 * como "nunca pular". Exercita a RLS de verdade (0001_rls.sql,
 * 0004_ingestion_rls.sql) contra um Postgres vivo — não é um teste de
 * unidade com mock. Precisa de `DATABASE_URL` apontando para um banco
 * já migrado (`infra/docker-compose.yml` sobe um em desenvolvimento).
 *
 * Cobre as duas tabelas que ganharam repository real nesta tarefa
 * (`receipts`, `inbound_messages`): SELECT não vaza linha de outro
 * tenant (nem por id direto), e INSERT com `tenant_id` deliberadamente
 * incompatível com `app.tenant_id` da sessão é rejeitado pelo próprio
 * banco — defesa em profundidade mesmo se o código de aplicação tiver
 * bug e passar o tenant errado (CLAUDE.md invariante 3).
 */

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb, getRootDb } from "@/db/client";
import { tenants } from "@/db/schema/tenancy";
import { inboundMessages, receipts, whatsappChannels } from "@/db/schema/ingestion";

/** `.returning()` sempre devolve 1 linha aqui (insert único) — só formaliza isso pro compilador (noUncheckedIndexedAccess). */
function firstOrThrow<T>(rows: readonly T[]): T {
  const row = rows[0];
  if (!row) throw new Error("Insert de setup do teste não devolveu nenhuma linha.");
  return row;
}

let tenantAId: string;
let tenantBId: string;
let channelAId: string;
let channelBId: string;

beforeAll(async () => {
  const root = getRootDb();

  const tenantA = firstOrThrow(
    await root
      .insert(tenants)
      .values({ name: "Tenant A (teste isolamento)", slug: `tenant-a-isolation-${randomUUID()}` })
      .returning({ id: tenants.id }),
  );
  const tenantB = firstOrThrow(
    await root
      .insert(tenants)
      .values({ name: "Tenant B (teste isolamento)", slug: `tenant-b-isolation-${randomUUID()}` })
      .returning({ id: tenants.id }),
  );
  tenantAId = tenantA.id;
  tenantBId = tenantB.id;

  const channelA = firstOrThrow(
    await root
      .insert(whatsappChannels)
      .values({
        tenantId: tenantAId,
        phoneNumberId: `whatsapp:+test-a-${randomUUID()}`,
        displayNumber: "+5511900000001",
      })
      .returning({ id: whatsappChannels.id }),
  );
  const channelB = firstOrThrow(
    await root
      .insert(whatsappChannels)
      .values({
        tenantId: tenantBId,
        phoneNumberId: `whatsapp:+test-b-${randomUUID()}`,
        displayNumber: "+5511900000002",
      })
      .returning({ id: whatsappChannels.id }),
  );
  channelAId = channelA.id;
  channelBId = channelB.id;
}, 30_000);

afterAll(async () => {
  // Cascade (onDelete: "cascade" em tenant_id) limpa receipts/receipt_extractions/
  // whatsapp_channels/inbound_messages dos dois tenants de teste.
  const root = getRootDb();
  await root.delete(tenants).where(eq(tenants.id, tenantAId));
  await root.delete(tenants).where(eq(tenants.id, tenantBId));
});

describe("isolamento cross-tenant — receipts", () => {
  let receiptAId: string;
  let receiptBId: string;

  beforeAll(async () => {
    const ctxA = { tenantId: tenantAId };
    const ctxB = { tenantId: tenantBId };

    const receiptA = firstOrThrow(
      await getDb(ctxA, (db) =>
        db
          .insert(receipts)
          .values({
            tenantId: tenantAId,
            source: "whatsapp",
            storageKey: "a/00/00/hash-a.jpg",
            mimeType: "image/jpeg",
            sizeBytes: 100,
            contentHash: `hash-a-${randomUUID()}`,
          })
          .returning({ id: receipts.id }),
      ),
    );
    const receiptB = firstOrThrow(
      await getDb(ctxB, (db) =>
        db
          .insert(receipts)
          .values({
            tenantId: tenantBId,
            source: "whatsapp",
            storageKey: "b/00/00/hash-b.jpg",
            mimeType: "image/jpeg",
            sizeBytes: 100,
            contentHash: `hash-b-${randomUUID()}`,
          })
          .returning({ id: receipts.id }),
      ),
    );
    receiptAId = receiptA.id;
    receiptBId = receiptB.id;
  });

  it("sessão do tenant A só enxerga o próprio receipt no SELECT geral", async () => {
    const ctxA = { tenantId: tenantAId };
    const rows = await getDb(ctxA, (db) => db.select({ id: receipts.id }).from(receipts));
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(receiptAId);
    expect(ids).not.toContain(receiptBId);
  });

  it("sessão do tenant A não enxerga o receipt do tenant B mesmo buscando pelo id direto", async () => {
    const ctxA = { tenantId: tenantAId };
    const rows = await getDb(ctxA, (db) =>
      db.select({ id: receipts.id }).from(receipts).where(eq(receipts.id, receiptBId)),
    );
    expect(rows).toHaveLength(0);
  });

  it("banco recusa INSERT com tenant_id que não bate com app.tenant_id da sessão", async () => {
    const ctxA = { tenantId: tenantAId };
    await expect(
      getDb(ctxA, (db) =>
        db.insert(receipts).values({
          tenantId: tenantBId, // deliberadamente errado sob a sessão de A
          source: "whatsapp",
          storageKey: "x/00/00/hash-x.jpg",
          mimeType: "image/jpeg",
          sizeBytes: 100,
          contentHash: `hash-x-${randomUUID()}`,
        }),
      ),
    ).rejects.toThrow();
  });
});

describe("isolamento cross-tenant — inbound_messages", () => {
  let messageAId: string;
  let messageBId: string;

  beforeAll(async () => {
    const ctxA = { tenantId: tenantAId };
    const ctxB = { tenantId: tenantBId };

    const messageA = firstOrThrow(
      await getDb(ctxA, (db) =>
        db
          .insert(inboundMessages)
          .values({
            tenantId: tenantAId,
            channelId: channelAId,
            providerMessageId: `SM-a-${randomUUID()}`,
            kind: "text",
          })
          .returning({ id: inboundMessages.id }),
      ),
    );
    const messageB = firstOrThrow(
      await getDb(ctxB, (db) =>
        db
          .insert(inboundMessages)
          .values({
            tenantId: tenantBId,
            channelId: channelBId,
            providerMessageId: `SM-b-${randomUUID()}`,
            kind: "text",
          })
          .returning({ id: inboundMessages.id }),
      ),
    );
    messageAId = messageA.id;
    messageBId = messageB.id;
  });

  it("sessão do tenant B só enxerga a própria mensagem no SELECT geral", async () => {
    const ctxB = { tenantId: tenantBId };
    const rows = await getDb(ctxB, (db) => db.select({ id: inboundMessages.id }).from(inboundMessages));
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(messageBId);
    expect(ids).not.toContain(messageAId);
  });

  it("sessão do tenant B não enxerga a mensagem do tenant A mesmo buscando pelo id direto", async () => {
    const ctxB = { tenantId: tenantBId };
    const rows = await getDb(ctxB, (db) =>
      db.select({ id: inboundMessages.id }).from(inboundMessages).where(eq(inboundMessages.id, messageAId)),
    );
    expect(rows).toHaveLength(0);
  });
});
