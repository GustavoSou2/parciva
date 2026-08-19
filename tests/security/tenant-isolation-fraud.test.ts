/**
 * Isolamento cross-tenant — Fase 5 (fatia 1, 19/08/2026): `fraud_checks`
 * (tabela nova) e `reconciliation_proposals` (RLS desde `0008_
 * reconciliation_proposals_rls.sql`/Marco 4, mas nunca exercitada contra
 * Postgres vivo até agora — `tenant-isolation-reconciliation.test.ts` só
 * cobre o caminho `executeManualPayment`, que nunca grava uma proposal).
 *
 * Fixture via `executeReceiptPayment` de verdade (nunca insert cru) — é o
 * único caminho real que escreve nas duas tabelas juntas. O resultado
 * (`auto_applied` ou `needs_review`) não importa pra este teste: as duas
 * tabelas são escritas sempre, independente da decisão.
 */

import { randomUUID, createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { getDb, getRootDb, type TenantContext } from "@/db/client";
import { tenants } from "@/db/schema/tenancy";
import { fraudChecks, reconciliationProposals } from "@/db/schema/financial";
import { createPayer, savePayer, documentHashExists } from "@/modules/payers";
import { createContract, saveContractWithSchedule, externalRefExists } from "@/modules/contracts";
import { createReceipt } from "@/modules/ingestion";
import { executeReceiptPayment } from "@/modules/reconciliation";
import { money } from "@/shared/money";
import { isErr } from "@/shared/result";

function firstOrThrow<T>(rows: readonly T[]): T {
  const row = rows[0];
  if (!row) throw new Error("Insert de setup do teste não devolveu nenhuma linha.");
  return row;
}

interface Fixture {
  readonly receiptId: string;
  readonly proposalId: string;
  readonly fraudCheckId: string;
}

async function buildFixture(ctx: TenantContext, label: string): Promise<Fixture> {
  const payerResult = await createPayer(
    ctx,
    { name: `Payer isolamento fraud ${label} ${randomUUID().slice(0, 8)}` },
    {
      documentHashPepper: "pepper-teste-isolamento",
      documentHashExists: (h) => documentHashExists(ctx, h),
      savePayer: (input) => savePayer(ctx, input),
    },
  );
  if (isErr(payerResult)) throw new Error(`createPayer falhou: ${payerResult.error}`);
  const payerId = payerResult.value.payerId;

  const contractResult = await createContract(
    ctx,
    {
      payerId,
      principalCents: money(10_000),
      installmentsCount: 1,
      startDate: "2020-01-01",
      earlyPaymentPolicy: "credit_balance",
    },
    {
      externalRefExists: (ref) => externalRefExists(ctx, ref),
      saveContractWithSchedule: (input, schedule) => saveContractWithSchedule(ctx, input, schedule),
    },
  );
  if (isErr(contractResult)) throw new Error(`createContract falhou: ${contractResult.error}`);
  const contractId = contractResult.value.contractId;

  const receiptId = randomUUID();
  await createReceipt(ctx, {
    id: receiptId,
    source: "upload",
    storageKey: `isolamento-fraud-${label}-${randomUUID()}`,
    mimeType: "image/jpeg",
    sizeBytes: 1024,
    contentHash: createHash("sha256").update(`isolamento-fraud-${label}-${randomUUID()}`).digest("hex"),
    receivedAt: new Date(),
  });

  const paymentResult = await executeReceiptPayment(ctx, {
    payerId,
    contractId,
    receiptId,
    amountCents: money(15_000),
    paidAt: new Date(),
    method: "pix",
    confidence: 0.5,
    fieldConfidence: {},
    identificationTier: "phone",
    ceilingCents: money(500_000),
    referenceDate: new Date(),
  });
  if (isErr(paymentResult)) throw new Error(`executeReceiptPayment falhou: ${paymentResult.error}`);

  const [proposalRow] = await getDb(ctx, (db) =>
    db
      .select({ id: reconciliationProposals.id })
      .from(reconciliationProposals)
      .where(eq(reconciliationProposals.receiptId, receiptId)),
  );
  if (!proposalRow) throw new Error("reconciliation_proposals não foi gravada — não deveria acontecer.");

  const [fraudCheckRow] = await getDb(ctx, (db) =>
    db.select({ id: fraudChecks.id }).from(fraudChecks).where(eq(fraudChecks.receiptId, receiptId)),
  );
  if (!fraudCheckRow) throw new Error("fraud_checks não foi gravada — não deveria acontecer.");

  return { receiptId, proposalId: proposalRow.id, fraudCheckId: fraudCheckRow.id };
}

let tenantAId: string;
let tenantBId: string;
let fixtureA: Fixture;
let fixtureB: Fixture;

beforeAll(async () => {
  const root = getRootDb();
  const tenantA = firstOrThrow(
    await root
      .insert(tenants)
      .values({ name: "Tenant A (isolamento fraud)", slug: `tenant-a-fraud-${randomUUID()}` })
      .returning({ id: tenants.id }),
  );
  const tenantB = firstOrThrow(
    await root
      .insert(tenants)
      .values({ name: "Tenant B (isolamento fraud)", slug: `tenant-b-fraud-${randomUUID()}` })
      .returning({ id: tenants.id }),
  );
  tenantAId = tenantA.id;
  tenantBId = tenantB.id;

  fixtureA = await buildFixture({ tenantId: tenantAId }, "A");
  fixtureB = await buildFixture({ tenantId: tenantBId }, "B");
}, 30_000);

// Sem `afterAll` — mesmo precedente de `tenant-isolation-reconciliation.test.ts`:
// o caminho real (`executeReceiptPayment`) pode gravar em `ledger_entries`
// quando a decisão é `auto_applied`, e a trigger append-only bloqueia
// qualquer DELETE nela, inclusive via CASCADE de `DELETE FROM tenants`.

describe("isolamento cross-tenant — reconciliation_proposals", () => {
  it("sessão do tenant A só enxerga a própria proposal no SELECT geral", async () => {
    const ctxA = { tenantId: tenantAId };
    const rows = await getDb(ctxA, (db) =>
      db.select({ id: reconciliationProposals.id }).from(reconciliationProposals),
    );
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(fixtureA.proposalId);
    expect(ids).not.toContain(fixtureB.proposalId);
  });

  it("sessão do tenant A não enxerga a proposal do tenant B mesmo pelo id direto", async () => {
    const ctxA = { tenantId: tenantAId };
    const rows = await getDb(ctxA, (db) =>
      db
        .select({ id: reconciliationProposals.id })
        .from(reconciliationProposals)
        .where(eq(reconciliationProposals.id, fixtureB.proposalId)),
    );
    expect(rows).toHaveLength(0);
  });

  it("banco recusa INSERT em reconciliation_proposals com tenant_id que não bate com app.tenant_id", async () => {
    const ctxA = { tenantId: tenantAId };
    await expect(
      getDb(ctxA, (db) =>
        db.insert(reconciliationProposals).values({
          tenantId: tenantBId,
          receiptId: fixtureA.receiptId,
          paymentId: null,
          confidence: "0.5",
          decision: "needs_review",
        }),
      ),
    ).rejects.toThrow();
  });
});

describe("isolamento cross-tenant — fraud_checks", () => {
  it("sessão do tenant A só enxerga o próprio check no SELECT geral", async () => {
    const ctxA = { tenantId: tenantAId };
    const rows = await getDb(ctxA, (db) => db.select({ id: fraudChecks.id }).from(fraudChecks));
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(fixtureA.fraudCheckId);
    expect(ids).not.toContain(fixtureB.fraudCheckId);
  });

  it("sessão do tenant A não enxerga o check do tenant B mesmo pelo id direto", async () => {
    const ctxA = { tenantId: tenantAId };
    const rows = await getDb(ctxA, (db) =>
      db.select({ id: fraudChecks.id }).from(fraudChecks).where(eq(fraudChecks.id, fixtureB.fraudCheckId)),
    );
    expect(rows).toHaveLength(0);
  });

  it("banco recusa INSERT em fraud_checks com tenant_id que não bate com app.tenant_id", async () => {
    const ctxA = { tenantId: tenantAId };
    await expect(
      getDb(ctxA, (db) =>
        db.insert(fraudChecks).values({
          tenantId: tenantBId,
          receiptId: fixtureA.receiptId,
          checkCode: "amount_match",
          result: "pass",
          weight: "50",
        }),
      ),
    ).rejects.toThrow();
  });
});
