/**
 * Isolamento cross-tenant — Marco 6 do roadmap. Cobre as 3 tabelas do
 * Modelo B (cobrança PIX própria, spec §2.5/§6.2): `psp_connections`,
 * `charges`, `charge_installments`. Criadas vazias desde a Fase 1, sem
 * módulo de aplicação ainda (só chegam na Fase 6) — por isso os inserts
 * aqui são crus via Drizzle, não há função de repositório pra reusar
 * (confirmado: nenhum `src/modules/{psp,charges}/` existe hoje).
 *
 * Sem lançamento em `ledger_entries` neste fixture — diferente de
 * `tenant-isolation-reconciliation.test.ts`, pode limpar os tenants de
 * teste no `afterAll` normalmente.
 */

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb, getRootDb, type TenantContext } from "@/db/client";
import { tenants } from "@/db/schema/tenancy";
import { pspConnections, charges, chargeInstallments } from "@/db/schema/financial";
import { createPayer, savePayer, documentHashExists } from "@/modules/payers";
import {
  createContract,
  saveContractWithSchedule,
  externalRefExists,
  listInstallmentsByContract,
} from "@/modules/contracts";
import { money } from "@/shared/money";
import { isErr } from "@/shared/result";

function firstOrThrow<T>(rows: readonly T[]): T {
  const row = rows[0];
  if (!row) throw new Error("Insert de setup do teste não devolveu nenhuma linha.");
  return row;
}

interface Fixture {
  readonly payerId: string;
  readonly contractId: string;
  readonly installmentId: string;
  readonly pspConnectionId: string;
  readonly chargeId: string;
  readonly chargeInstallmentId: string;
}

async function buildFixture(ctx: TenantContext, label: string): Promise<Fixture> {
  const payerResult = await createPayer(
    ctx,
    { name: `Payer isolamento charges ${label} ${randomUUID().slice(0, 8)}` },
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

  const [installment] = await listInstallmentsByContract(ctx, contractId);
  if (!installment) throw new Error("Parcela não foi gerada — não deveria acontecer.");

  const pspConnectionRow = firstOrThrow(
    await getDb(ctx, (db) =>
      db
        .insert(pspConnections)
        .values({
          tenantId: ctx.tenantId,
          provider: "asaas",
          accountRef: `acc-${label}-${randomUUID()}`,
          credentialsRef: `vault://psp/${randomUUID()}`, // ponteiro, nunca o segredo (invariante 7)
        })
        .returning({ id: pspConnections.id }),
    ),
  );

  const chargeRow = firstOrThrow(
    await getDb(ctx, (db) =>
      db
        .insert(charges)
        .values({
          tenantId: ctx.tenantId,
          pspConnectionId: pspConnectionRow.id,
          payerId,
          contractId,
          txid: `txid-${label}-${randomUUID()}`,
          amountCents: 10_000,
          expiresAt: new Date(Date.now() + 3_600_000),
        })
        .returning({ id: charges.id }),
    ),
  );

  const chargeInstallmentRow = firstOrThrow(
    await getDb(ctx, (db) =>
      db
        .insert(chargeInstallments)
        .values({
          tenantId: ctx.tenantId,
          chargeId: chargeRow.id,
          installmentId: installment.id,
          amountCents: 10_000,
        })
        .returning({ id: chargeInstallments.id }),
    ),
  );

  return {
    payerId,
    contractId,
    installmentId: installment.id,
    pspConnectionId: pspConnectionRow.id,
    chargeId: chargeRow.id,
    chargeInstallmentId: chargeInstallmentRow.id,
  };
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
      .values({ name: "Tenant A (isolamento charges)", slug: `tenant-a-charges-${randomUUID()}` })
      .returning({ id: tenants.id }),
  );
  const tenantB = firstOrThrow(
    await root
      .insert(tenants)
      .values({ name: "Tenant B (isolamento charges)", slug: `tenant-b-charges-${randomUUID()}` })
      .returning({ id: tenants.id }),
  );
  tenantAId = tenantA.id;
  tenantBId = tenantB.id;

  fixtureA = await buildFixture({ tenantId: tenantAId }, "A");
  fixtureB = await buildFixture({ tenantId: tenantBId }, "B");
}, 30_000);

afterAll(async () => {
  // Cascade (onDelete: "cascade" em tenant_id) limpa payers/contracts/
  // installments/psp_connections/charges/charge_installments dos dois
  // tenants — nenhuma dessas 3 tabelas tem trigger append-only.
  const root = getRootDb();
  await root.delete(tenants).where(eq(tenants.id, tenantAId));
  await root.delete(tenants).where(eq(tenants.id, tenantBId));
});

describe("isolamento cross-tenant — psp_connections", () => {
  it("sessão do tenant A só enxerga a própria conexão no SELECT geral", async () => {
    const ctxA = { tenantId: tenantAId };
    const rows = await getDb(ctxA, (db) => db.select({ id: pspConnections.id }).from(pspConnections));
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(fixtureA.pspConnectionId);
    expect(ids).not.toContain(fixtureB.pspConnectionId);
  });

  it("sessão do tenant A não enxerga a conexão do tenant B mesmo pelo id direto", async () => {
    const ctxA = { tenantId: tenantAId };
    const rows = await getDb(ctxA, (db) =>
      db.select({ id: pspConnections.id }).from(pspConnections).where(eq(pspConnections.id, fixtureB.pspConnectionId)),
    );
    expect(rows).toHaveLength(0);
  });

  it("banco recusa INSERT em psp_connections com tenant_id que não bate com app.tenant_id", async () => {
    const ctxA = { tenantId: tenantAId };
    await expect(
      getDb(ctxA, (db) =>
        db.insert(pspConnections).values({
          tenantId: tenantBId,
          provider: "asaas",
          accountRef: "acc-intruso",
          credentialsRef: "vault://psp/intruso",
        }),
      ),
    ).rejects.toThrow();
  });
});

describe("isolamento cross-tenant — charges", () => {
  it("sessão do tenant A só enxerga a própria cobrança no SELECT geral", async () => {
    const ctxA = { tenantId: tenantAId };
    const rows = await getDb(ctxA, (db) => db.select({ id: charges.id }).from(charges));
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(fixtureA.chargeId);
    expect(ids).not.toContain(fixtureB.chargeId);
  });

  it("sessão do tenant A não enxerga a cobrança do tenant B mesmo pelo id direto", async () => {
    const ctxA = { tenantId: tenantAId };
    const rows = await getDb(ctxA, (db) =>
      db.select({ id: charges.id }).from(charges).where(eq(charges.id, fixtureB.chargeId)),
    );
    expect(rows).toHaveLength(0);
  });

  it("banco recusa INSERT em charges com tenant_id que não bate com app.tenant_id", async () => {
    const ctxA = { tenantId: tenantAId };
    await expect(
      getDb(ctxA, (db) =>
        db.insert(charges).values({
          tenantId: tenantBId,
          pspConnectionId: fixtureA.pspConnectionId,
          payerId: fixtureA.payerId,
          contractId: fixtureA.contractId,
          txid: `txid-intruso-${randomUUID()}`,
          amountCents: 1000,
          expiresAt: new Date(Date.now() + 3_600_000),
        }),
      ),
    ).rejects.toThrow();
  });
});

describe("isolamento cross-tenant — charge_installments", () => {
  it("sessão do tenant A só enxerga o próprio vínculo no SELECT geral", async () => {
    const ctxA = { tenantId: tenantAId };
    const rows = await getDb(ctxA, (db) =>
      db.select({ id: chargeInstallments.id }).from(chargeInstallments),
    );
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(fixtureA.chargeInstallmentId);
    expect(ids).not.toContain(fixtureB.chargeInstallmentId);
  });

  it("sessão do tenant A não enxerga o vínculo do tenant B mesmo pelo id direto", async () => {
    const ctxA = { tenantId: tenantAId };
    const rows = await getDb(ctxA, (db) =>
      db
        .select({ id: chargeInstallments.id })
        .from(chargeInstallments)
        .where(eq(chargeInstallments.id, fixtureB.chargeInstallmentId)),
    );
    expect(rows).toHaveLength(0);
  });

  it("banco recusa INSERT em charge_installments com tenant_id que não bate com app.tenant_id", async () => {
    const ctxA = { tenantId: tenantAId };
    await expect(
      getDb(ctxA, (db) =>
        db.insert(chargeInstallments).values({
          tenantId: tenantBId,
          chargeId: fixtureA.chargeId,
          installmentId: fixtureA.installmentId,
          amountCents: 1000,
        }),
      ),
    ).rejects.toThrow();
  });
});
