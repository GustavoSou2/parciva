import { and, desc, eq, sql } from "drizzle-orm";
import { getDb, type TenantContext, type TenantDb } from "@/db/client";
import { contracts, installments, payers } from "@/db/schema/financial";
import { money, type Money } from "@/shared/money";
import type {
  Contract,
  EarlyPaymentPolicy,
  Installment,
  InstallmentSchedule,
  NewContractInput,
} from "../domain/types";

function toContract(row: typeof contracts.$inferSelect): Contract {
  return {
    id: row.id,
    payerId: row.payerId,
    externalRef: row.externalRef,
    description: row.description,
    principalCents: money(row.principalCents),
    installmentsCount: row.installmentsCount,
    earlyPaymentPolicy: row.earlyPaymentPolicy,
    toleranceCents: money(row.toleranceCents),
    startDate: row.startDate,
    status: row.status,
  };
}

function toInstallment(row: typeof installments.$inferSelect): Installment {
  return {
    id: row.id,
    contractId: row.contractId,
    number: row.number,
    dueDate: row.dueDate,
    amountCents: money(row.amountCents),
    fineCents: money(row.fineCents),
    interestCents: money(row.interestCents),
    paidCents: money(row.paidCents),
    status: row.status,
    version: row.version,
  };
}

export async function externalRefExists(ctx: TenantContext, externalRef: string): Promise<boolean> {
  const rows = await getDb(ctx, (db) =>
    db
      .select({ id: contracts.id })
      .from(contracts)
      .where(and(eq(contracts.tenantId, ctx.tenantId), eq(contracts.externalRef, externalRef)))
      .limit(1),
  );
  return rows.length > 0;
}

/** `earlyPaymentPolicy`/`toleranceCents` chegam sempre resolvidos aqui — a normalização de default acontece em `application/create-contract.ts`, antes de chamar este repositório. */
type NormalizedContractInput = NewContractInput & {
  earlyPaymentPolicy: EarlyPaymentPolicy;
  toleranceCents: Money;
};

export async function saveContractWithSchedule(
  ctx: TenantContext,
  input: NormalizedContractInput,
  schedule: InstallmentSchedule[],
): Promise<{ contractId: string }> {
  return getDb(ctx, async (db) => {
    const [contractRow] = await db
      .insert(contracts)
      .values({
        tenantId: ctx.tenantId,
        payerId: input.payerId,
        externalRef: input.externalRef ?? null,
        description: input.description ?? null,
        principalCents: input.principalCents,
        installmentsCount: input.installmentsCount,
        earlyPaymentPolicy: input.earlyPaymentPolicy,
        toleranceCents: input.toleranceCents,
        startDate: input.startDate,
      })
      .returning({ id: contracts.id });
    if (!contractRow) throw new Error("Insert de contract não retornou linha — não deveria acontecer.");

    await db.insert(installments).values(
      schedule.map((item) => ({
        tenantId: ctx.tenantId,
        contractId: contractRow.id,
        number: item.number,
        dueDate: item.dueDate,
        amountCents: item.amountCents,
      })),
    );

    return { contractId: contractRow.id };
  });
}

export async function getContractById(ctx: TenantContext, contractId: string): Promise<Contract | null> {
  const rows = await getDb(ctx, (db) =>
    db
      .select()
      .from(contracts)
      .where(and(eq(contracts.tenantId, ctx.tenantId), eq(contracts.id, contractId)))
      .limit(1),
  );
  return rows[0] ? toContract(rows[0]) : null;
}

export interface ContractSummary extends Contract {
  readonly payerName: string;
}

/** Lista pra tela `contracts/page.tsx` — join com `payers` evita N+1 (uma query por linha da lista). */
export async function listContracts(ctx: TenantContext): Promise<ContractSummary[]> {
  const rows = await getDb(ctx, (db) =>
    db
      .select({ contract: contracts, payerName: payers.name })
      .from(contracts)
      .innerJoin(payers, eq(contracts.payerId, payers.id))
      .where(eq(contracts.tenantId, ctx.tenantId))
      .orderBy(desc(contracts.createdAt)),
  );
  return rows.map((row) => ({ ...toContract(row.contract), payerName: row.payerName }));
}

export async function listContractsByPayer(ctx: TenantContext, payerId: string): Promise<Contract[]> {
  const rows = await getDb(ctx, (db) =>
    db
      .select()
      .from(contracts)
      .where(and(eq(contracts.tenantId, ctx.tenantId), eq(contracts.payerId, payerId)))
      .orderBy(desc(contracts.createdAt)),
  );
  return rows.map(toContract);
}

export async function listInstallmentsByContract(
  ctx: TenantContext,
  contractId: string,
): Promise<Installment[]> {
  const rows = await getDb(ctx, (db) =>
    db
      .select()
      .from(installments)
      .where(and(eq(installments.tenantId, ctx.tenantId), eq(installments.contractId, contractId)))
      .orderBy(installments.number),
  );
  return rows.map(toInstallment);
}

/**
 * `SELECT ... FOR UPDATE` — usada por `reconciliation` dentro da MESMA
 * transação que vai decidir a alocação e escrever `payments`/
 * `payment_allocations`/ledger (o lock só vale enquanto a transação
 * estiver aberta, por isso recebe `db` já aberto, não `ctx`). Serializa
 * "dois comprovantes no mesmo minuto" (spec §6.7) — o segundo `SELECT
 * FOR UPDATE` do mesmo contrato espera o primeiro commitar antes de ler.
 */
export async function lockInstallmentsByContractTx(
  db: TenantDb,
  tenantId: string,
  contractId: string,
): Promise<Installment[]> {
  const rows = await db
    .select()
    .from(installments)
    .where(and(eq(installments.tenantId, tenantId), eq(installments.contractId, contractId)))
    .orderBy(installments.number)
    .for("update");
  return rows.map(toInstallment);
}

export async function updateInstallmentTx(
  db: TenantDb,
  tenantId: string,
  installmentId: string,
  data: { paidCents: Money; status: Installment["status"] },
): Promise<void> {
  await db
    .update(installments)
    .set({
      paidCents: data.paidCents,
      status: data.status,
      // `version` é metadata de optimistic locking — incrementa a cada
      // write, mesmo usando lock pessimista (SELECT ... FOR UPDATE) como
      // mecanismo de serialização real neste marco (ver DECISIONS.md).
      // Mantém a coluna coerente para um CAS futuro, se/quando precisar.
      version: sql`${installments.version} + 1`,
      updatedAt: new Date(),
    })
    .where(and(eq(installments.tenantId, tenantId), eq(installments.id, installmentId)));
}
