/**
 * Isolamento cross-tenant — Fase 5 (fatia 2, 19/08/2026): `statement_
 * imports`/`statement_lines` (tabelas novas, conciliação por extrato).
 *
 * Fixture via `importStatement` de verdade (nunca insert cru) — cria
 * pagador+contrato, registra um pagamento manual com `transactionRef`
 * conhecido (`document`), depois importa um CSV cuja descrição contém
 * o mesmo E2E id — exercita o caminho real de match automático
 * (`findPaymentByTransactionRef`/`upgradeVerificationLevelToStatement`,
 * `@/modules/reconciliation`) junto com a persistência.
 */

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { getDb, getRootDb, type TenantContext } from "@/db/client";
import { tenants } from "@/db/schema/tenancy";
import { statementImports, statementLines } from "@/db/schema/statements";
import { createPayer, savePayer, documentHashExists } from "@/modules/payers";
import { createContract, saveContractWithSchedule, externalRefExists } from "@/modules/contracts";
import { createUser } from "@/modules/identity";
import {
  executeManualPayment,
  findPaymentByTransactionRef,
  upgradeVerificationLevelToStatement,
} from "@/modules/reconciliation";
import { importStatement, recordStatementImport } from "@/modules/statements";
import { money } from "@/shared/money";
import { isErr } from "@/shared/result";

function firstOrThrow<T>(rows: readonly T[]): T {
  const row = rows[0];
  if (!row) throw new Error("Insert de setup do teste não devolveu nenhuma linha.");
  return row;
}

interface Fixture {
  readonly importId: string;
  readonly lineId: string;
  readonly uploaderUserId: string;
}

async function buildFixture(ctx: TenantContext, label: string): Promise<Fixture> {
  const payerResult = await createPayer(
    ctx,
    { name: `Payer isolamento statements ${label} ${randomUUID().slice(0, 8)}` },
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

  // E2E id sintético válido pro regex (E + 8 dígitos ISPB + 12 dígitos + 11 alfanuméricos = 32 chars).
  const timestamp12 = Date.now().toString().padStart(12, "0").slice(-12);
  const suffix11 = `${label}${randomUUID().replace(/-/g, "")}`.slice(0, 11).padEnd(11, "0");
  const e2eId = `E00000000${timestamp12}${suffix11}`;

  const paymentResult = await executeManualPayment(ctx, {
    payerId,
    contractId,
    amountCents: money(10_000),
    paidAt: new Date(),
    method: "pix",
    transactionRef: e2eId,
  });
  if (isErr(paymentResult)) throw new Error(`executeManualPayment falhou: ${paymentResult.error}`);

  const user = await createUser({ email: `isolamento-stmt-${label}-${randomUUID()}@example.com`, name: "Uploader" });

  const csv = ["Data,Histórico,Valor", `15/08/2026,PIX RECEBIDO ${e2eId},100.00`].join("\n");

  const importResult = await importStatement(
    { filename: `extrato-${label}.csv`, uploadedBy: user.userId, rawCsv: csv },
    {
      findPaymentByTransactionRef: (ref) => findPaymentByTransactionRef(ctx, ref),
      upgradeVerificationLevelToStatement: (paymentId) => upgradeVerificationLevelToStatement(ctx, paymentId),
      recordStatementImport: (input) => recordStatementImport(ctx, input),
    },
  );
  if (isErr(importResult)) throw new Error(`importStatement falhou: ${importResult.error}`);

  const lineRow = firstOrThrow(
    await getDb(ctx, (db) =>
      db
        .select({ id: statementLines.id })
        .from(statementLines)
        .where(eq(statementLines.statementImportId, importResult.value.importId)),
    ),
  );

  return { importId: importResult.value.importId, lineId: lineRow.id, uploaderUserId: user.userId };
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
      .values({ name: "Tenant A (isolamento statements)", slug: `tenant-a-stmt-${randomUUID()}` })
      .returning({ id: tenants.id }),
  );
  const tenantB = firstOrThrow(
    await root
      .insert(tenants)
      .values({ name: "Tenant B (isolamento statements)", slug: `tenant-b-stmt-${randomUUID()}` })
      .returning({ id: tenants.id }),
  );
  tenantAId = tenantA.id;
  tenantBId = tenantB.id;

  fixtureA = await buildFixture({ tenantId: tenantAId }, "A");
  fixtureB = await buildFixture({ tenantId: tenantBId }, "B");
}, 30_000);

// Sem `afterAll` — mesmo precedente dos outros arquivos de isolamento
// desta sessão: o fixture grava em `ledger_entries` (via
// `executeManualPayment`), append-only, bloqueia DELETE inclusive via
// CASCADE de `DELETE FROM tenants`.

describe("isolamento cross-tenant — statement_imports", () => {
  it("sessão do tenant A só enxerga o próprio import no SELECT geral", async () => {
    const ctxA = { tenantId: tenantAId };
    const rows = await getDb(ctxA, (db) => db.select({ id: statementImports.id }).from(statementImports));
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(fixtureA.importId);
    expect(ids).not.toContain(fixtureB.importId);
  });

  it("sessão do tenant A não enxerga o import do tenant B mesmo pelo id direto", async () => {
    const ctxA = { tenantId: tenantAId };
    const rows = await getDb(ctxA, (db) =>
      db.select({ id: statementImports.id }).from(statementImports).where(eq(statementImports.id, fixtureB.importId)),
    );
    expect(rows).toHaveLength(0);
  });

  it("banco recusa INSERT em statement_imports com tenant_id que não bate com app.tenant_id", async () => {
    const ctxA = { tenantId: tenantAId };
    await expect(
      getDb(ctxA, (db) =>
        db.insert(statementImports).values({
          tenantId: tenantBId,
          filename: "intruso.csv",
          uploadedBy: fixtureA.uploaderUserId,
          lineCount: 0,
        }),
      ),
    ).rejects.toThrow();
  });
});

describe("isolamento cross-tenant — statement_lines", () => {
  it("sessão do tenant A só enxerga a própria linha no SELECT geral", async () => {
    const ctxA = { tenantId: tenantAId };
    const rows = await getDb(ctxA, (db) => db.select({ id: statementLines.id }).from(statementLines));
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(fixtureA.lineId);
    expect(ids).not.toContain(fixtureB.lineId);
  });

  it("sessão do tenant A não enxerga a linha do tenant B mesmo pelo id direto", async () => {
    const ctxA = { tenantId: tenantAId };
    const rows = await getDb(ctxA, (db) =>
      db.select({ id: statementLines.id }).from(statementLines).where(eq(statementLines.id, fixtureB.lineId)),
    );
    expect(rows).toHaveLength(0);
  });

  it("banco recusa INSERT em statement_lines com tenant_id que não bate com app.tenant_id", async () => {
    const ctxA = { tenantId: tenantAId };
    await expect(
      getDb(ctxA, (db) =>
        db.insert(statementLines).values({
          tenantId: tenantBId,
          statementImportId: fixtureA.importId,
          occurredAt: new Date(),
          description: "intruso",
          amountCents: 100,
        }),
      ),
    ).rejects.toThrow();
  });
});
