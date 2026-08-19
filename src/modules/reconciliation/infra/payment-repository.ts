/**
 * Unidade de trabalho transacional do registro manual de pagamento, da
 * reversão e da decisão de auto-aplicação de comprovante — spec §6,
 * §14 Fase 1, §6.6. Tudo dentro de UMA `getDb()` só: o lock de
 * `SELECT ... FOR UPDATE` em `installments` (via
 * `lockInstallmentsByContractTx`, módulo `contracts`) só vale enquanto a
 * transação estiver aberta, e `payments`/`payment_allocations`/
 * `installments`/`credit_balances`/`ledger_entries`/
 * `reconciliation_proposals` precisam ser tudo-ou-nada (CLAUDE.md
 * invariante 2/3).
 *
 * `executeReceiptPayment` decide DENTRO da mesma transação que trava as
 * parcelas — não recebe uma decisão pronta de fora. Isso evita a janela
 * de corrida entre "calcular a alocação para decidir auto-aplicar" e
 * "gravar de verdade": a alocação que embasa `decideAutoApply` é a
 * mesma, travada, que acaba gravada — nunca uma prévia desatualizada.
 * Uma linha em `reconciliation_proposals` é sempre gravada, auto-aplicada
 * ou não — é o log de auditoria da decisão (spec §5.3).
 *
 * Import direto de `@/db/schema/financial` (não de `modules/x/infra`
 * de outro módulo) é deliberado aqui: uma transação que atravessa
 * várias tabelas é a exceção que justifica a exceção — só
 * `lockInstallmentsByContractTx`/`updateInstallmentTx` (contracts),
 * `writeEntryTx` (ledger) e `evaluateFraudChecks`/`recordFraudChecksTx`
 * (fraud, Fase 5, 19/08/2026) são reusados via seus `index.ts` públicos,
 * porque cada um carrega regra própria (cálculo de status/estorno de
 * `installments`, formato/`rule_version` do ledger, peso/score dos
 * checks de fraude) que não deve ser duplicada aqui.
 */

import { createHash } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb, type TenantContext, type TenantDb } from "@/db/client";
import {
  installments,
  ledgerEntries,
  payments,
  paymentAllocations,
  creditBalances,
} from "@/db/schema/financial";
import { add, isZero, max as moneyMax, money, subtract, ZERO, type Money } from "@/shared/money";
import type { Result } from "@/shared/result";
import { err, ok } from "@/shared/result";
import {
  getContractById,
  lockInstallmentsByContractTx,
  updateInstallmentTx,
} from "@/modules/contracts";
import { writeEntryTx } from "@/modules/ledger";
import type { FieldConfidence } from "@/modules/ingestion";
import type { IdentificationTier } from "@/modules/payers";
import { evaluateFraudChecks, recordFraudChecksTx } from "@/modules/fraud";
import { allocatePayment, owedCents } from "../domain/allocation-engine";
import { decideAutoApply, isPlausibleDate } from "../domain/auto-apply-decision";
import type {
  AllocatableInstallment,
  AllocationResult,
  Payment,
  PaymentMethod,
  RegisterManualPaymentInput,
} from "../domain/types";
import { createProposalTx, lockProposalByIdTx, markProposalReviewedTx } from "./proposal-repository";

function toPayment(row: typeof payments.$inferSelect): Payment {
  return {
    id: row.id,
    payerId: row.payerId,
    origin: row.origin,
    verificationLevel: row.verificationLevel,
    amountCents: money(row.amountCents),
    paidAt: row.paidAt,
    method: row.method,
    transactionRef: row.transactionRef,
    status: row.status,
    createdAt: row.createdAt,
  };
}

const RULE_VERSION = "alloc-v1";

/** Não precisa de pepper (não é dado sensível tipo CPF) — só chave de dedupe, mesmo espírito de `computeHash` em ingestion/domain/normalizer.ts. */
function hashTransactionRef(ref: string): string {
  return createHash("sha256").update(ref).digest("hex");
}

/**
 * Check `e2e_reuse` proativo (spec §8, Camada B) — consulta pelo mesmo
 * índice único que hoje só era descoberto reativamente (violação
 * `23505` no insert, ver `isUniqueViolation`/catch em
 * `executeReceiptPayment`). Roda DENTRO da mesma transação que trava as
 * parcelas, então não abre janela de corrida nova; o catch reativo
 * continua como rede de segurança contra a corrida que sempre existiu
 * entre "consultar" e "inserir" de fato.
 */
async function transactionRefAlreadyUsedTx(
  db: TenantDb,
  tenantId: string,
  transactionRefHash: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: payments.id })
    .from(payments)
    .where(and(eq(payments.tenantId, tenantId), eq(payments.transactionRefHash, transactionRefHash)))
    .limit(1);
  return rows.length > 0;
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

interface ApplyAllocationParams {
  readonly payerId: string;
  readonly contractId: string;
  readonly amountCents: Money;
  readonly paidAt: Date;
  readonly method: PaymentMethod;
  readonly transactionRef: string | null;
  readonly transactionRefHash: string | null;
  readonly actorUserId: string | null;
  readonly origin: "manual" | "receipt" | "statement";
  readonly verificationLevel: "unverified" | "document" | "statement";
  readonly receiptId: string | null;
  readonly allocation: AllocationResult;
}

/** `manual`/`statement` são sempre decisão humana explícita (a segunda, um humano escolhendo pagador/contrato pra uma linha de extrato); `receipt` é o motor decidindo sozinho (`decideAutoApply` já disse `auto_applied`). */
const HUMAN_INITIATED_ORIGINS: ReadonlySet<ApplyAllocationParams["origin"]> = new Set(["manual", "statement"]);

/**
 * Escreve `payments`/`payment_allocations`/`installments`/
 * `ledger_entries`/`credit_balances` para UMA alocação já calculada —
 * núcleo compartilhado por `executeManualPayment` (sempre aplica,
 * decisão humana explícita) e `executeReceiptPayment` (só chama isto
 * quando `decideAutoApply` já disse `auto_applied`, dentro da mesma
 * transação/lock).
 */
async function applyAllocationTx(
  db: TenantDb,
  ctx: TenantContext,
  params: ApplyAllocationParams,
): Promise<{ paymentId: string }> {
  const [paymentRow] = await db
    .insert(payments)
    .values({
      tenantId: ctx.tenantId,
      payerId: params.payerId,
      origin: params.origin,
      receiptId: params.receiptId,
      verificationLevel: params.verificationLevel,
      amountCents: params.amountCents,
      paidAt: params.paidAt,
      method: params.method,
      transactionRef: params.transactionRef,
      transactionRefHash: params.transactionRefHash,
      status: "applied",
    })
    .returning({ id: payments.id });
  if (!paymentRow) throw new Error("Insert de payment não retornou linha — não deveria acontecer.");

  const allocation = params.allocation;

  if (allocation.allocations.length > 0) {
    await db.insert(paymentAllocations).values(
      allocation.allocations.map((line) => ({
        tenantId: ctx.tenantId,
        paymentId: paymentRow.id,
        installmentId: line.installmentId,
        amountCents: line.amountCents,
        kind: line.kind,
      })),
    );
  }

  for (const update of allocation.installmentUpdates) {
    await updateInstallmentTx(db, ctx.tenantId, update.installmentId, {
      paidCents: update.newPaidCents,
      status: update.newStatus,
    });
  }

  // Consumido por parcela = soma das linhas de alocação daquela parcela — vai no lançamento do ledger, um por parcela tocada.
  const consumedByInstallment = new Map<string, Money>();
  for (const line of allocation.allocations) {
    consumedByInstallment.set(
      line.installmentId,
      add(consumedByInstallment.get(line.installmentId) ?? ZERO, line.amountCents),
    );
  }
  for (const update of allocation.installmentUpdates) {
    const consumed = consumedByInstallment.get(update.installmentId) ?? ZERO;
    await writeEntryTx(db, ctx.tenantId, {
      entryType: "payment_applied",
      payerId: params.payerId,
      contractId: params.contractId,
      installmentId: update.installmentId,
      paymentId: paymentRow.id,
      amountCents: consumed,
      direction: "credit",
      actorType: HUMAN_INITIATED_ORIGINS.has(params.origin) ? "user" : "system",
      actorId: params.actorUserId,
      ruleVersion: RULE_VERSION,
    });
  }

  if (allocation.remainingCents > 0) {
    await db.insert(creditBalances).values({
      tenantId: ctx.tenantId,
      payerId: params.payerId,
      amountCents: allocation.remainingCents,
      sourcePaymentId: paymentRow.id,
    });
    await writeEntryTx(db, ctx.tenantId, {
      entryType: "credit_balance_created",
      payerId: params.payerId,
      contractId: params.contractId,
      paymentId: paymentRow.id,
      amountCents: allocation.remainingCents,
      direction: "credit",
      actorType: HUMAN_INITIATED_ORIGINS.has(params.origin) ? "user" : "system",
      actorId: params.actorUserId,
      ruleVersion: RULE_VERSION,
    });
  }

  return { paymentId: paymentRow.id };
}

export type RegisterManualPaymentError =
  | "contract_not_found"
  | "no_eligible_installments"
  | "duplicate_transaction";

export async function executeManualPayment(
  ctx: TenantContext,
  input: RegisterManualPaymentInput,
): Promise<Result<{ paymentId: string }, RegisterManualPaymentError>> {
  const contract = await getContractById(ctx, input.contractId);
  if (!contract) return err("contract_not_found");

  try {
    return await getDb(ctx, async (db) => {
      const locked = await lockInstallmentsByContractTx(db, ctx.tenantId, input.contractId);
      const allocatable: AllocatableInstallment[] = locked.map((i) => ({
        id: i.id,
        dueDate: i.dueDate,
        amountCents: i.amountCents,
        fineCents: i.fineCents,
        interestCents: i.interestCents,
        paidCents: i.paidCents,
        status: i.status,
      }));

      const referenceDate = input.paidAt.toISOString().slice(0, 10);
      const allocation = allocatePayment(allocatable, input.amountCents, {
        toleranceCents: contract.toleranceCents,
        earlyPaymentPolicy: contract.earlyPaymentPolicy,
        referenceDate,
      });

      const transactionRefHash = input.transactionRef ? hashTransactionRef(input.transactionRef) : null;

      const result = await applyAllocationTx(db, ctx, {
        payerId: input.payerId,
        contractId: input.contractId,
        amountCents: input.amountCents,
        paidAt: input.paidAt,
        method: input.method,
        transactionRef: input.transactionRef ?? null,
        transactionRefHash,
        actorUserId: input.actorUserId ?? null,
        origin: "manual",
        verificationLevel: "unverified", // nunca "confirmado" nesta fase — DECISIONS.md [5]
        receiptId: null,
        allocation,
      });

      return ok(result);
    });
  } catch (error) {
    if (isUniqueViolation(error)) return err("duplicate_transaction");
    throw error;
  }
}

/**
 * Terceira variação de `applyAllocationTx` (mesma forma de
 * `executeManualPayment`, só troca `origin`/`verificationLevel`) —
 * usada pelo caminho manual de conciliação por extrato (Fase 5, fatia
 * 2, 19/08/2026, `@/modules/statements`): um humano escolheu pagador/
 * contrato pra uma linha de extrato sem match automático. `statement`
 * é um nível de verificação real aqui — o crédito já consta no
 * extrato bancário importado, mais forte que `document` (spec §8.3).
 */
export async function executeStatementPayment(
  ctx: TenantContext,
  input: RegisterManualPaymentInput,
): Promise<Result<{ paymentId: string }, RegisterManualPaymentError>> {
  const contract = await getContractById(ctx, input.contractId);
  if (!contract) return err("contract_not_found");

  try {
    return await getDb(ctx, async (db) => {
      const locked = await lockInstallmentsByContractTx(db, ctx.tenantId, input.contractId);
      const allocatable: AllocatableInstallment[] = locked.map((i) => ({
        id: i.id,
        dueDate: i.dueDate,
        amountCents: i.amountCents,
        fineCents: i.fineCents,
        interestCents: i.interestCents,
        paidCents: i.paidCents,
        status: i.status,
      }));

      const referenceDate = input.paidAt.toISOString().slice(0, 10);
      const allocation = allocatePayment(allocatable, input.amountCents, {
        toleranceCents: contract.toleranceCents,
        earlyPaymentPolicy: contract.earlyPaymentPolicy,
        referenceDate,
      });

      const transactionRefHash = input.transactionRef ? hashTransactionRef(input.transactionRef) : null;

      const result = await applyAllocationTx(db, ctx, {
        payerId: input.payerId,
        contractId: input.contractId,
        amountCents: input.amountCents,
        paidAt: input.paidAt,
        method: input.method,
        transactionRef: input.transactionRef ?? null,
        transactionRefHash,
        actorUserId: input.actorUserId ?? null,
        origin: "statement",
        verificationLevel: "statement",
        receiptId: null,
        allocation,
      });

      return ok(result);
    });
  } catch (error) {
    if (isUniqueViolation(error)) return err("duplicate_transaction");
    throw error;
  }
}

/**
 * Usada por `@/modules/statements` pra casar uma linha de extrato pelo
 * E2E id extraído da descrição — nunca lida com hash, só com o E2E id
 * bruto (o hashing fica encapsulado aqui, mesma função privada
 * `hashTransactionRef` usada pra escrever `payments`). 0 ou 1
 * resultado, nunca ambíguo (índice único por tenant+hash).
 */
export async function findPaymentByTransactionRef(
  ctx: TenantContext,
  rawTransactionRef: string,
): Promise<{ id: string; verificationLevel: string } | null> {
  const hash = hashTransactionRef(rawTransactionRef);
  const rows = await getDb(ctx, (db) =>
    db
      .select({ id: payments.id, verificationLevel: payments.verificationLevel })
      .from(payments)
      .where(and(eq(payments.tenantId, ctx.tenantId), eq(payments.transactionRefHash, hash)))
      .limit(1),
  );
  return rows[0] ?? null;
}

/**
 * "Nível sobe, nunca desce" (spec §8.3) garantido no próprio SQL — não
 * depende de quem chama checar o nível atual antes. Sem I/O em
 * `ledger_entries`: é upgrade de metadado de verificação, não um novo
 * lançamento de dinheiro.
 */
export async function upgradeVerificationLevelToStatement(
  ctx: TenantContext,
  paymentId: string,
): Promise<void> {
  await getDb(ctx, (db) =>
    db
      .update(payments)
      .set({ verificationLevel: "statement" })
      .where(
        and(
          eq(payments.tenantId, ctx.tenantId),
          eq(payments.id, paymentId),
          inArray(payments.verificationLevel, ["unverified", "document"]),
        ),
      ),
  );
}

export interface ReceiptPaymentInput {
  readonly payerId: string;
  readonly contractId: string;
  readonly receiptId: string;
  readonly amountCents: Money;
  readonly paidAt: Date;
  readonly method: PaymentMethod;
  readonly transactionRef?: string;
  readonly confidence: number;
  readonly fieldConfidence: FieldConfidence;
  readonly identificationTier: IdentificationTier | null;
  readonly ceilingCents: Money;
  /** "Agora" — plausibilidade de `paidAt` (spec §6.6), nunca a mesma data usada para separar parcelas vencidas/futuras (essa é `paidAt`). */
  readonly referenceDate: Date;
}

export type ReceiptPaymentOutcome =
  | { readonly decision: "auto_applied"; readonly paymentId: string }
  | { readonly decision: "needs_review" };

export async function executeReceiptPayment(
  ctx: TenantContext,
  input: ReceiptPaymentInput,
): Promise<Result<ReceiptPaymentOutcome, RegisterManualPaymentError>> {
  const contract = await getContractById(ctx, input.contractId);
  if (!contract) return err("contract_not_found");

  try {
    return await executeReceiptPaymentTx(ctx, contract, input);
  } catch (error) {
    // Mesmo `transaction_ref` de um pagamento já aplicado (spec §5.5) —
    // Postgres aborta a transação inteira nesse ponto (nada do que essa
    // tentativa escreveu, nem a proposta, sobrevive); devolver o erro em
    // vez de deixar propagar deixa `process-receipt-extraction.ts` cair
    // no mesmo caminho de revisão humana de qualquer outra falha aqui —
    // nunca aplicar o mesmo comprovante duas vezes, mas também nunca
    // derrubar o worker por isso (mesmo padrão de `executeManualPayment`).
    if (isUniqueViolation(error)) return err("duplicate_transaction");
    throw error;
  }
}

async function executeReceiptPaymentTx(
  ctx: TenantContext,
  contract: NonNullable<Awaited<ReturnType<typeof getContractById>>>,
  input: ReceiptPaymentInput,
): Promise<Result<ReceiptPaymentOutcome, RegisterManualPaymentError>> {
  return getDb(ctx, async (db) => {
    const locked = await lockInstallmentsByContractTx(db, ctx.tenantId, input.contractId);
    const allocatable: AllocatableInstallment[] = locked.map((i) => ({
      id: i.id,
      dueDate: i.dueDate,
      amountCents: i.amountCents,
      fineCents: i.fineCents,
      interestCents: i.interestCents,
      paidCents: i.paidCents,
      status: i.status,
    }));

    const allocationReferenceDate = input.paidAt.toISOString().slice(0, 10);
    const allocation = allocatePayment(allocatable, input.amountCents, {
      toleranceCents: contract.toleranceCents,
      earlyPaymentPolicy: contract.earlyPaymentPolicy,
      referenceDate: allocationReferenceDate,
    });

    const transactionRefHash = input.transactionRef ? hashTransactionRef(input.transactionRef) : null;
    const transactionRefReused = transactionRefHash
      ? await transactionRefAlreadyUsedTx(db, ctx.tenantId, transactionRefHash)
      : false;

    const fraudAssessment = evaluateFraudChecks({
      amountMatches: isZero(allocation.remainingCents),
      datePlausible: isPlausibleDate(input.paidAt, input.referenceDate),
      transactionRefReused,
    });

    const decision = decideAutoApply({
      confidence: input.confidence,
      fieldConfidence: input.fieldConfidence,
      identificationTier: input.identificationTier,
      remainingCents: allocation.remainingCents,
      paidAt: input.paidAt,
      referenceDate: input.referenceDate,
      amountCents: input.amountCents,
      ceilingCents: input.ceilingCents,
      blocksAutoApply: fraudAssessment.blocksAutoApply,
    });

    let paymentId: string | null = null;
    if (decision === "auto_applied") {
      const result = await applyAllocationTx(db, ctx, {
        payerId: input.payerId,
        contractId: input.contractId,
        amountCents: input.amountCents,
        paidAt: input.paidAt,
        method: input.method,
        transactionRef: input.transactionRef ?? null,
        transactionRefHash,
        actorUserId: null,
        origin: "receipt",
        verificationLevel: "document", // nunca "confirmado" — só comprovante, sem confirmação do PSP (DECISIONS.md [5])
        receiptId: input.receiptId,
        allocation,
      });
      paymentId = result.paymentId;
    }

    await recordFraudChecksTx(db, ctx.tenantId, input.receiptId, fraudAssessment.checks);

    await createProposalTx(db, ctx.tenantId, {
      receiptId: input.receiptId,
      paymentId,
      proposedAllocations: allocation.allocations,
      confidence: input.confidence,
      riskScore: fraudAssessment.riskScore,
      decision,
    });

    return ok(
      paymentId ? { decision: "auto_applied" as const, paymentId } : { decision: "needs_review" as const },
    );
  });
}

export interface ApproveReceiptProposalInput {
  readonly proposalId: string;
  readonly receiptId: string;
  readonly payerId: string;
  readonly contractId: string;
  readonly amountCents: Money;
  readonly paidAt: Date;
  readonly method: PaymentMethod;
  readonly transactionRef?: string;
  readonly actorUserId: string;
}

export type ApproveReceiptProposalError =
  | "proposal_not_found"
  | "already_reviewed"
  | "contract_not_found"
  | "duplicate_transaction";

/**
 * Aprovar na fila de revisão (Marco 5, spec §6.6 "revisão humana") —
 * sempre recalcula a alocação NA HORA, dentro do lock, nunca reaproveita
 * `proposal.proposedAllocations` (gravado quando a proposta foi criada —
 * pode estar desatualizado se outro pagamento tocou o contrato desde
 * então). Mesmo cuidado de "sem janela de corrida" de
 * `executeReceiptPaymentTx`, mesma trava (`SELECT ... FOR UPDATE`) na
 * proposal E nas installments, ambas na mesma transação.
 *
 * `origin: "receipt"` / `verificationLevel: "document"` — nunca
 * "confirmado" (decisão [5]): aprovação humana de um comprovante não é
 * confirmação do PSP.
 */
export async function approveReceiptProposal(
  ctx: TenantContext,
  input: ApproveReceiptProposalInput,
): Promise<Result<{ paymentId: string }, ApproveReceiptProposalError>> {
  const contract = await getContractById(ctx, input.contractId);
  if (!contract) return err("contract_not_found");

  try {
    return await getDb(ctx, async (db) => {
      const proposal = await lockProposalByIdTx(db, ctx.tenantId, input.proposalId);
      if (!proposal) return err("proposal_not_found");
      if (proposal.decision !== "needs_review") return err("already_reviewed");

      const locked = await lockInstallmentsByContractTx(db, ctx.tenantId, input.contractId);
      const allocatable: AllocatableInstallment[] = locked.map((i) => ({
        id: i.id,
        dueDate: i.dueDate,
        amountCents: i.amountCents,
        fineCents: i.fineCents,
        interestCents: i.interestCents,
        paidCents: i.paidCents,
        status: i.status,
      }));

      const referenceDate = input.paidAt.toISOString().slice(0, 10);
      const allocation = allocatePayment(allocatable, input.amountCents, {
        toleranceCents: contract.toleranceCents,
        earlyPaymentPolicy: contract.earlyPaymentPolicy,
        referenceDate,
      });

      const transactionRefHash = input.transactionRef ? hashTransactionRef(input.transactionRef) : null;

      const result = await applyAllocationTx(db, ctx, {
        payerId: input.payerId,
        contractId: input.contractId,
        amountCents: input.amountCents,
        paidAt: input.paidAt,
        method: input.method,
        transactionRef: input.transactionRef ?? null,
        transactionRefHash,
        actorUserId: input.actorUserId,
        origin: "receipt",
        verificationLevel: "document",
        receiptId: input.receiptId,
        allocation,
      });

      await markProposalReviewedTx(db, ctx.tenantId, input.proposalId, {
        decision: "reviewed_approved",
        paymentId: result.paymentId,
        reviewedBy: input.actorUserId,
      });

      return ok(result);
    });
  } catch (error) {
    if (isUniqueViolation(error)) return err("duplicate_transaction");
    throw error;
  }
}

export type ReversePaymentError = "payment_not_found" | "already_reversed";

export async function executeReversal(
  ctx: TenantContext,
  paymentId: string,
  actorUserId: string | undefined,
): Promise<Result<void, ReversePaymentError>> {
  return getDb(ctx, async (db) => {
    const [paymentRow] = await db
      .select()
      .from(payments)
      .where(and(eq(payments.tenantId, ctx.tenantId), eq(payments.id, paymentId)))
      .for("update");
    if (!paymentRow) return err("payment_not_found");
    if (paymentRow.status === "reversed") return err("already_reversed");

    const allocations = await db
      .select()
      .from(paymentAllocations)
      .where(
        and(eq(paymentAllocations.tenantId, ctx.tenantId), eq(paymentAllocations.paymentId, paymentId)),
      );

    // Soma por parcela — uma parcela pode ter recebido juros+multa+principal na alocação original.
    const amountByInstallment = new Map<string, Money>();
    for (const allocation of allocations) {
      amountByInstallment.set(
        allocation.installmentId,
        add(amountByInstallment.get(allocation.installmentId) ?? ZERO, money(allocation.amountCents)),
      );
    }

    for (const [installmentId, reversedAmount] of amountByInstallment) {
      const [installmentRow] = await db
        .select()
        .from(installments)
        .where(and(eq(installments.tenantId, ctx.tenantId), eq(installments.id, installmentId)))
        .for("update");
      if (!installmentRow) continue;

      const newPaidCents = moneyMax(ZERO, subtract(money(installmentRow.paidCents), reversedAmount));
      const devido = owedCents({
        id: installmentRow.id,
        dueDate: installmentRow.dueDate,
        amountCents: money(installmentRow.amountCents),
        fineCents: money(installmentRow.fineCents),
        interestCents: money(installmentRow.interestCents),
        paidCents: newPaidCents,
        status: installmentRow.status,
      });
      const newStatus = newPaidCents === 0 ? "pending" : devido > 0 ? "partial" : "paid";

      await updateInstallmentTx(db, ctx.tenantId, installmentId, { paidCents: newPaidCents, status: newStatus });
    }

    // Lê direto com `db` (não via ledger.listEntriesForPayment, que abriria
    // uma transação própria via getDb() — quebraria a garantia de "tudo
    // numa transação só" que este arquivo inteiro existe para manter).
    const originalEntries = await db
      .select()
      .from(ledgerEntries)
      .where(and(eq(ledgerEntries.tenantId, ctx.tenantId), eq(ledgerEntries.paymentId, paymentId)));

    for (const entry of originalEntries) {
      if (entry.direction !== "credit") continue;
      await writeEntryTx(db, ctx.tenantId, {
        entryType: "payment_reversed",
        payerId: entry.payerId,
        contractId: entry.contractId,
        installmentId: entry.installmentId,
        paymentId: entry.paymentId,
        amountCents: money(entry.amountCents),
        direction: "debit",
        reversesEntryId: entry.id,
        actorType: "user",
        actorId: actorUserId ?? null,
        ruleVersion: RULE_VERSION,
      });
    }

    await db
      .update(payments)
      .set({ status: "reversed", updatedAt: new Date() })
      .where(and(eq(payments.tenantId, ctx.tenantId), eq(payments.id, paymentId)));

    return ok(undefined);
  });
}

/**
 * `payments` não tem `contract_id` direto (spec §5.2 — um pagamento se
 * relaciona a parcelas via `payment_allocations`, e parcelas a contrato
 * via `installments.contract_id`). Duas leituras, não precisa de
 * transação (read-only).
 */
export async function listPaymentsByContract(ctx: TenantContext, contractId: string): Promise<Payment[]> {
  const allocationRows = await getDb(ctx, (db) =>
    db
      .selectDistinct({ paymentId: paymentAllocations.paymentId })
      .from(paymentAllocations)
      .innerJoin(installments, eq(paymentAllocations.installmentId, installments.id))
      .where(
        and(eq(paymentAllocations.tenantId, ctx.tenantId), eq(installments.contractId, contractId)),
      ),
  );
  const paymentIds = allocationRows.map((row) => row.paymentId);
  if (paymentIds.length === 0) return [];

  const rows = await getDb(ctx, (db) =>
    db
      .select()
      .from(payments)
      .where(and(eq(payments.tenantId, ctx.tenantId), inArray(payments.id, paymentIds)))
      .orderBy(desc(payments.paidAt)),
  );
  return rows.map(toPayment);
}
