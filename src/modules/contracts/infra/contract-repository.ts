import { and, desc, eq, ne, sql } from "drizzle-orm";
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
    createdAt: row.createdAt,
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

/** Mesma checagem de `externalRefExists`, excluindo o próprio contrato — editar sem trocar a referência não deveria "colidir com si mesmo". */
export async function externalRefExistsExcluding(
  ctx: TenantContext,
  externalRef: string,
  excludeContractId: string,
): Promise<boolean> {
  const rows = await getDb(ctx, (db) =>
    db
      .select({ id: contracts.id })
      .from(contracts)
      .where(
        and(
          eq(contracts.tenantId, ctx.tenantId),
          eq(contracts.externalRef, externalRef),
          ne(contracts.id, excludeContractId),
        ),
      )
      .limit(1),
  );
  return rows.length > 0;
}

/** Só metadado (`description`/`externalRef`) — nunca os campos estruturais que já geraram `installments` (decisão do usuário). */
export async function saveContractMetadata(
  ctx: TenantContext,
  contractId: string,
  data: { description: string | null; externalRef: string | null },
): Promise<void> {
  await getDb(ctx, (db) =>
    db
      .update(contracts)
      .set({ description: data.description, externalRef: data.externalRef, updatedAt: new Date() })
      .where(and(eq(contracts.tenantId, ctx.tenantId), eq(contracts.id, contractId))),
  );
}

/**
 * Cancelar contrato — nunca `DELETE`. Trava as parcelas (mesmo lock de
 * `lockInstallmentsByContractTx` usado pra aplicar pagamento) e marca
 * `cancelled` toda parcela que NÃO estiver `paid`; parcela paga é fato
 * histórico, nunca tocada. Sem lançamento de ledger — mudança de status
 * administrativo, não movimento de dinheiro (mesmo raciocínio do
 * upgrade de `verification_level` na conciliação por extrato).
 */
export async function cancelContractTx(ctx: TenantContext, contractId: string): Promise<void> {
  await getDb(ctx, async (db) => {
    const locked = await lockInstallmentsByContractTx(db, ctx.tenantId, contractId);
    for (const installment of locked) {
      if (installment.status === "paid") continue;
      await updateInstallmentTx(db, ctx.tenantId, installment.id, {
        paidCents: installment.paidCents,
        status: "cancelled",
      });
    }

    await db
      .update(contracts)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(and(eq(contracts.tenantId, ctx.tenantId), eq(contracts.id, contractId)));
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

export interface ContractRiskInfo {
  readonly contractId: string;
  /** `null` quando não há parcela pendente/parcial em aberto (contrato liquidado ou só com parcelas futuras já pagas — não deveria acontecer, mas nulo é a resposta honesta). */
  readonly nextDueDate: string | null;
  readonly hasOverdue: boolean;
}

/**
 * Uma linha por contrato com pelo menos uma parcela não cancelada —
 * DESIGN.md v6 §7.8 ("data relevante de próxima ação") e §4.7.2 (rail
 * de Contratos, "taxa de contratos em dia vs. atraso"). Query única
 * agregada, não uma consulta por contrato (`listContracts` já evita
 * N+1 pro nome do pagador; isso segue o mesmo princípio pro cronograma).
 */
export async function listContractRiskInfo(ctx: TenantContext): Promise<ContractRiskInfo[]> {
  const rows = await getDb(ctx, (db) =>
    db
      .select({
        contractId: installments.contractId,
        nextDueDate: sql<string | null>`min(${installments.dueDate}) filter (where ${installments.status} in ('pending', 'partial'))`,
        hasOverdue: sql<boolean>`bool_or(${installments.status} = 'overdue')`,
      })
      .from(installments)
      .where(and(eq(installments.tenantId, ctx.tenantId), ne(installments.status, "cancelled")))
      .groupBy(installments.contractId),
  );
  return rows.map((row) => ({
    contractId: row.contractId,
    nextDueDate: row.nextDueDate,
    hasOverdue: row.hasOverdue,
  }));
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

/**
 * Resolve `contractId`/`payerId` a partir de um `installmentId` — usado
 * pela fila de revisão (Marco 5) para reconstruir o alvo já identificado
 * pelo motor a partir de `reconciliation_proposals.proposedAllocations`
 * (que só guarda `installmentId`, não contrato/pagador).
 */
export async function getInstallmentById(
  ctx: TenantContext,
  installmentId: string,
): Promise<(Installment & { readonly payerId: string }) | null> {
  const rows = await getDb(ctx, (db) =>
    db
      .select({ installment: installments, payerId: contracts.payerId })
      .from(installments)
      .innerJoin(contracts, eq(installments.contractId, contracts.id))
      .where(and(eq(installments.tenantId, ctx.tenantId), eq(installments.id, installmentId)))
      .limit(1),
  );
  const row = rows[0];
  return row ? { ...toInstallment(row.installment), payerId: row.payerId } : null;
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
