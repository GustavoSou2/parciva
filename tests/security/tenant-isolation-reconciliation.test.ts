/**
 * Isolamento cross-tenant — Marco 6 do roadmap. Estende
 * `tenant-isolation.test.ts` (que cobre só `receipts`/`inbound_messages`)
 * às tabelas centrais do motor de reconciliação: `payers`, `contracts`,
 * `installments`, `payments`, `payment_allocations`, `credit_balances`,
 * `ledger_entries`. Protegidas por RLS desde `0001_rls.sql`, mas nunca
 * exercitadas contra Postgres vivo antes desta tarefa — a decisão [13]
 * (DECISIONS.md) mostrou que essa lacuna já escondeu um bug real (RLS
 * inativa em dev por meses).
 *
 * Fixture única por tenant: `createPayer` → `createContract` (com
 * `startDate` no passado, pra a parcela nascer vencida) → `executeManualPayment`
 * pagando MAIS que o devido — isso povoa `payment_allocations`,
 * `credit_balances` E `ledger_entries` num só caminho real do motor
 * (nunca insert cru pra essas tabelas, que poderia violar invariante de
 * negócio sem ninguém notar).
 */

import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { getDb, getRootDb, type TenantContext } from "@/db/client";
import { tenants } from "@/db/schema/tenancy";
import {
  payers,
  contracts,
  installments,
  payments,
  paymentAllocations,
  creditBalances,
  ledgerEntries,
} from "@/db/schema/financial";
import { createPayer, savePayer, documentHashExists } from "@/modules/payers";
import { createContract, saveContractWithSchedule, externalRefExists } from "@/modules/contracts";
import { executeManualPayment } from "@/modules/reconciliation";
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
  readonly paymentId: string;
  readonly allocationId: string;
  readonly creditBalanceId: string;
  readonly ledgerEntryId: string;
}

/**
 * `startDate` de 2020 garante que a única parcela (vencimento = startDate
 * + 1 mês, ver `schedule.ts`) já está vencida em qualquer data de
 * execução do teste — necessário pra `allocatePayment` (política
 * `credit_balance`) tocar a parcela em vez de ignorá-la por ser futura.
 * Pagar mais que o principal força a sobra a virar `credit_balances`.
 */
async function buildFixture(ctx: TenantContext, label: string): Promise<Fixture> {
  const payerResult = await createPayer(
    ctx,
    { name: `Payer isolamento ${label} ${randomUUID().slice(0, 8)}` },
    {
      documentHashPepper: "pepper-teste-isolamento",
      documentHashExists: (h) => documentHashExists(ctx, h),
      savePayer: (input) => savePayer(ctx, input),
    },
  );
  if (isErr(payerResult)) throw new Error(`createPayer falhou: ${payerResult.error}`);
  const payerId = payerResult.value.payerId;

  const principal = money(10_000);
  const contractResult = await createContract(
    ctx,
    {
      payerId,
      principalCents: principal,
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

  const [installmentRow] = await getDb(ctx, (db) =>
    db.select({ id: installments.id }).from(installments).where(eq(installments.contractId, contractId)),
  );
  if (!installmentRow) throw new Error("Parcela não foi gerada — não deveria acontecer.");
  const installmentId = installmentRow.id;

  const paymentResult = await executeManualPayment(ctx, {
    payerId,
    contractId,
    amountCents: money(15_000), // 5.000 acima do principal — vira credit_balance
    paidAt: new Date(),
    method: "pix",
    transactionRef: `isolamento-${label}-${randomUUID()}`,
  });
  if (isErr(paymentResult)) throw new Error(`executeManualPayment falhou: ${paymentResult.error}`);
  const paymentId = paymentResult.value.paymentId;

  const [allocationRow] = await getDb(ctx, (db) =>
    db
      .select({ id: paymentAllocations.id })
      .from(paymentAllocations)
      .where(eq(paymentAllocations.paymentId, paymentId)),
  );
  const [creditBalanceRow] = await getDb(ctx, (db) =>
    db
      .select({ id: creditBalances.id })
      .from(creditBalances)
      .where(eq(creditBalances.sourcePaymentId, paymentId)),
  );
  const [ledgerEntryRow] = await getDb(ctx, (db) =>
    db.select({ id: ledgerEntries.id }).from(ledgerEntries).where(eq(ledgerEntries.paymentId, paymentId)),
  );
  if (!allocationRow) throw new Error("payment_allocations não foi gravado — não deveria acontecer.");
  if (!creditBalanceRow) throw new Error("credit_balances não foi gravado — não deveria acontecer.");
  if (!ledgerEntryRow) throw new Error("ledger_entries não foi gravado — não deveria acontecer.");

  return {
    payerId,
    contractId,
    installmentId,
    paymentId,
    allocationId: allocationRow.id,
    creditBalanceId: creditBalanceRow.id,
    ledgerEntryId: ledgerEntryRow.id,
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
      .values({ name: "Tenant A (isolamento reconciliation)", slug: `tenant-a-recon-${randomUUID()}` })
      .returning({ id: tenants.id }),
  );
  const tenantB = firstOrThrow(
    await root
      .insert(tenants)
      .values({ name: "Tenant B (isolamento reconciliation)", slug: `tenant-b-recon-${randomUUID()}` })
      .returning({ id: tenants.id }),
  );
  tenantAId = tenantA.id;
  tenantBId = tenantB.id;

  fixtureA = await buildFixture({ tenantId: tenantAId }, "A");
  fixtureB = await buildFixture({ tenantId: tenantBId }, "B");
}, 30_000);

// Sem `afterAll` de limpeza de propósito: este fixture escreve em
// `ledger_entries`, e a trigger append-only (invariante 2,
// `0002_ledger_trigger.sql`) bloqueia QUALQUER DELETE nela — inclusive
// via CASCADE de `DELETE FROM tenants`. Tentar limpar o tenant de teste
// aqui derruba o teste inteiro com "ledger_entries é append-only
// (tentativa de DELETE)", exatamente o comportamento que a decisão [2]
// documenta como esperado. Os tenants de teste ficam no banco de dev —
// mesmo precedente já aceito nos scripts de verificação dos Marcos 1/4.

describe("isolamento cross-tenant — payers", () => {
  it("sessão do tenant A só enxerga o próprio payer no SELECT geral", async () => {
    const ctxA = { tenantId: tenantAId };
    const rows = await getDb(ctxA, (db) => db.select({ id: payers.id }).from(payers));
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(fixtureA.payerId);
    expect(ids).not.toContain(fixtureB.payerId);
  });

  it("sessão do tenant A não enxerga o payer do tenant B mesmo pelo id direto", async () => {
    const ctxA = { tenantId: tenantAId };
    const rows = await getDb(ctxA, (db) =>
      db.select({ id: payers.id }).from(payers).where(eq(payers.id, fixtureB.payerId)),
    );
    expect(rows).toHaveLength(0);
  });

  it("banco recusa INSERT em payers com tenant_id que não bate com app.tenant_id", async () => {
    const ctxA = { tenantId: tenantAId };
    await expect(
      getDb(ctxA, (db) =>
        db.insert(payers).values({ tenantId: tenantBId, name: "Payer intruso" }),
      ),
    ).rejects.toThrow();
  });
});

describe("isolamento cross-tenant — contracts", () => {
  it("sessão do tenant A só enxerga o próprio contrato no SELECT geral", async () => {
    const ctxA = { tenantId: tenantAId };
    const rows = await getDb(ctxA, (db) => db.select({ id: contracts.id }).from(contracts));
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(fixtureA.contractId);
    expect(ids).not.toContain(fixtureB.contractId);
  });

  it("sessão do tenant A não enxerga o contrato do tenant B mesmo pelo id direto", async () => {
    const ctxA = { tenantId: tenantAId };
    const rows = await getDb(ctxA, (db) =>
      db.select({ id: contracts.id }).from(contracts).where(eq(contracts.id, fixtureB.contractId)),
    );
    expect(rows).toHaveLength(0);
  });

  it("banco recusa INSERT em contracts com tenant_id que não bate com app.tenant_id", async () => {
    const ctxA = { tenantId: tenantAId };
    await expect(
      getDb(ctxA, (db) =>
        db.insert(contracts).values({
          tenantId: tenantBId,
          payerId: fixtureA.payerId,
          principalCents: 1000,
          installmentsCount: 1,
          startDate: "2020-01-01",
        }),
      ),
    ).rejects.toThrow();
  });
});

describe("isolamento cross-tenant — installments", () => {
  it("sessão do tenant A só enxerga a própria parcela no SELECT geral", async () => {
    const ctxA = { tenantId: tenantAId };
    const rows = await getDb(ctxA, (db) => db.select({ id: installments.id }).from(installments));
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(fixtureA.installmentId);
    expect(ids).not.toContain(fixtureB.installmentId);
  });

  it("sessão do tenant A não enxerga a parcela do tenant B mesmo pelo id direto", async () => {
    const ctxA = { tenantId: tenantAId };
    const rows = await getDb(ctxA, (db) =>
      db.select({ id: installments.id }).from(installments).where(eq(installments.id, fixtureB.installmentId)),
    );
    expect(rows).toHaveLength(0);
  });

  it("banco recusa INSERT em installments com tenant_id que não bate com app.tenant_id", async () => {
    const ctxA = { tenantId: tenantAId };
    await expect(
      getDb(ctxA, (db) =>
        db.insert(installments).values({
          tenantId: tenantBId,
          contractId: fixtureA.contractId,
          number: 99,
          dueDate: "2020-02-01",
          amountCents: 1000,
        }),
      ),
    ).rejects.toThrow();
  });
});

describe("isolamento cross-tenant — payments", () => {
  it("sessão do tenant A só enxerga o próprio pagamento no SELECT geral", async () => {
    const ctxA = { tenantId: tenantAId };
    const rows = await getDb(ctxA, (db) => db.select({ id: payments.id }).from(payments));
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(fixtureA.paymentId);
    expect(ids).not.toContain(fixtureB.paymentId);
  });

  it("sessão do tenant A não enxerga o pagamento do tenant B mesmo pelo id direto", async () => {
    const ctxA = { tenantId: tenantAId };
    const rows = await getDb(ctxA, (db) =>
      db.select({ id: payments.id }).from(payments).where(eq(payments.id, fixtureB.paymentId)),
    );
    expect(rows).toHaveLength(0);
  });

  it("banco recusa INSERT em payments com tenant_id que não bate com app.tenant_id", async () => {
    const ctxA = { tenantId: tenantAId };
    await expect(
      getDb(ctxA, (db) =>
        db.insert(payments).values({
          tenantId: tenantBId,
          payerId: fixtureA.payerId,
          origin: "manual",
          verificationLevel: "unverified",
          amountCents: 1000,
          paidAt: new Date(),
          method: "pix",
        }),
      ),
    ).rejects.toThrow();
  });
});

describe("isolamento cross-tenant — payment_allocations", () => {
  it("sessão do tenant A só enxerga a própria alocação no SELECT geral", async () => {
    const ctxA = { tenantId: tenantAId };
    const rows = await getDb(ctxA, (db) =>
      db.select({ id: paymentAllocations.id }).from(paymentAllocations),
    );
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(fixtureA.allocationId);
    expect(ids).not.toContain(fixtureB.allocationId);
  });

  it("sessão do tenant A não enxerga a alocação do tenant B mesmo pelo id direto", async () => {
    const ctxA = { tenantId: tenantAId };
    const rows = await getDb(ctxA, (db) =>
      db
        .select({ id: paymentAllocations.id })
        .from(paymentAllocations)
        .where(eq(paymentAllocations.id, fixtureB.allocationId)),
    );
    expect(rows).toHaveLength(0);
  });

  it("banco recusa INSERT em payment_allocations com tenant_id que não bate com app.tenant_id", async () => {
    const ctxA = { tenantId: tenantAId };
    await expect(
      getDb(ctxA, (db) =>
        db.insert(paymentAllocations).values({
          tenantId: tenantBId,
          paymentId: fixtureA.paymentId,
          installmentId: fixtureA.installmentId,
          amountCents: 1000,
          kind: "principal",
        }),
      ),
    ).rejects.toThrow();
  });
});

describe("isolamento cross-tenant — credit_balances", () => {
  it("sessão do tenant A só enxerga o próprio saldo no SELECT geral", async () => {
    const ctxA = { tenantId: tenantAId };
    const rows = await getDb(ctxA, (db) => db.select({ id: creditBalances.id }).from(creditBalances));
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(fixtureA.creditBalanceId);
    expect(ids).not.toContain(fixtureB.creditBalanceId);
  });

  it("sessão do tenant A não enxerga o saldo do tenant B mesmo pelo id direto", async () => {
    const ctxA = { tenantId: tenantAId };
    const rows = await getDb(ctxA, (db) =>
      db.select({ id: creditBalances.id }).from(creditBalances).where(eq(creditBalances.id, fixtureB.creditBalanceId)),
    );
    expect(rows).toHaveLength(0);
  });

  it("banco recusa INSERT em credit_balances com tenant_id que não bate com app.tenant_id", async () => {
    const ctxA = { tenantId: tenantAId };
    await expect(
      getDb(ctxA, (db) =>
        db.insert(creditBalances).values({
          tenantId: tenantBId,
          payerId: fixtureA.payerId,
          amountCents: 1000,
          sourcePaymentId: fixtureA.paymentId,
        }),
      ),
    ).rejects.toThrow();
  });
});

describe("isolamento cross-tenant — ledger_entries", () => {
  it("sessão do tenant A só enxerga o próprio lançamento no SELECT geral", async () => {
    const ctxA = { tenantId: tenantAId };
    const rows = await getDb(ctxA, (db) => db.select({ id: ledgerEntries.id }).from(ledgerEntries));
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(fixtureA.ledgerEntryId);
    expect(ids).not.toContain(fixtureB.ledgerEntryId);
  });

  it("sessão do tenant A não enxerga o lançamento do tenant B mesmo pelo id direto", async () => {
    const ctxA = { tenantId: tenantAId };
    const rows = await getDb(ctxA, (db) =>
      db.select({ id: ledgerEntries.id }).from(ledgerEntries).where(eq(ledgerEntries.id, fixtureB.ledgerEntryId)),
    );
    expect(rows).toHaveLength(0);
  });

  it("banco recusa INSERT em ledger_entries com tenant_id que não bate com app.tenant_id", async () => {
    const ctxA = { tenantId: tenantAId };
    await expect(
      getDb(ctxA, (db) =>
        db.insert(ledgerEntries).values({
          tenantId: tenantBId,
          entryType: "payment_applied",
          amountCents: 1000,
          direction: "credit",
          actorType: "system",
          ruleVersion: "alloc-v1",
        }),
      ),
    ).rejects.toThrow();
  });

  // Trigger de append-only (0002_ledger_trigger.sql, invariante 2) — de
  // passagem, porque já temos uma linha real gravada por este arquivo;
  // não duplica o que decisão [2]/Marco 1 já provaram, só confirma que
  // a trigger continua ativa neste caminho específico (INSERT via
  // executeManualPayment, não via writeEntry direto).
  it("trigger append-only bloqueia UPDATE em ledger_entries mesmo dentro da sessão do próprio tenant", async () => {
    const ctxA = { tenantId: tenantAId };
    await expect(
      getDb(ctxA, (db) =>
        db
          .update(ledgerEntries)
          .set({ amountCents: 1 })
          .where(and(eq(ledgerEntries.tenantId, tenantAId), eq(ledgerEntries.id, fixtureA.ledgerEntryId))),
      ),
    ).rejects.toThrow();
  });
});
