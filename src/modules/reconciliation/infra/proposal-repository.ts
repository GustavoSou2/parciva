/**
 * `reconciliation_proposals` — spec §5.3, log de auditoria de toda
 * decisão do motor para o caminho `origin=receipt` (auto-aplicada ou
 * não). `createProposalTx` roda dentro da MESMA transação que decide
 * aplicar o pagamento (`infra/payment-repository.ts`) — uma linha
 * sempre é gravada, auto-aplicada ou não; nunca condicional.
 */

import { and, desc, eq } from "drizzle-orm";
import { getDb, type TenantContext, type TenantDb } from "@/db/client";
import { reconciliationProposals } from "@/db/schema/financial";
import type { AllocationLine, Proposal, ProposalDecision } from "../domain/types";

export type { ProposalDecision };

function toProposal(row: typeof reconciliationProposals.$inferSelect): Proposal {
  return {
    id: row.id,
    receiptId: row.receiptId,
    paymentId: row.paymentId,
    proposedAllocations: row.proposedAllocations as readonly AllocationLine[],
    confidence: Number(row.confidence),
    riskScore: row.riskScore !== null ? Number(row.riskScore) : null,
    decision: row.decision,
    reviewedBy: row.reviewedBy,
    reviewedAt: row.reviewedAt,
    reviewNote: row.reviewNote,
    createdAt: row.createdAt,
  };
}

export interface NewProposal {
  readonly receiptId: string;
  readonly paymentId: string | null;
  readonly proposedAllocations: readonly AllocationLine[];
  readonly confidence: number;
  /** Só preenchido quando a proposta passou por `executeReceiptPaymentTx` (`@/modules/fraud`) — `null` para os casos "não dá pra tentar" (sem pagador/contrato). */
  readonly riskScore?: number | null;
  readonly decision: ProposalDecision;
}

export async function createProposalTx(
  db: TenantDb,
  tenantId: string,
  data: NewProposal,
): Promise<{ proposalId: string }> {
  const [row] = await db
    .insert(reconciliationProposals)
    .values({
      tenantId,
      receiptId: data.receiptId,
      paymentId: data.paymentId,
      proposedAllocations: data.proposedAllocations,
      confidence: data.confidence.toString(),
      riskScore: data.riskScore != null ? data.riskScore.toString() : null,
      decision: data.decision,
    })
    .returning({ id: reconciliationProposals.id });
  if (!row) {
    throw new Error("Insert de reconciliation_proposal não retornou linha — não deveria acontecer.");
  }
  return { proposalId: row.id };
}

export async function createProposal(
  ctx: TenantContext,
  data: NewProposal,
): Promise<{ proposalId: string }> {
  return getDb(ctx, (db) => createProposalTx(db, ctx.tenantId, data));
}

/** Lista para `/t/<slug>/review` (Marco 5) — mais recente primeiro. */
export async function listProposalsByDecision(
  ctx: TenantContext,
  decision: ProposalDecision,
): Promise<Proposal[]> {
  const rows = await getDb(ctx, (db) =>
    db
      .select()
      .from(reconciliationProposals)
      .where(and(eq(reconciliationProposals.tenantId, ctx.tenantId), eq(reconciliationProposals.decision, decision)))
      .orderBy(desc(reconciliationProposals.createdAt)),
  );
  return rows.map(toProposal);
}

export async function getProposalById(ctx: TenantContext, proposalId: string): Promise<Proposal | null> {
  const rows = await getDb(ctx, (db) =>
    db
      .select()
      .from(reconciliationProposals)
      .where(and(eq(reconciliationProposals.tenantId, ctx.tenantId), eq(reconciliationProposals.id, proposalId)))
      .limit(1),
  );
  return rows[0] ? toProposal(rows[0]) : null;
}

/** Fila de revisão humana (spec §6.6, tela `/t/<slug>/review` — Marco 5) — usada pelo caminho "rejeitar" (sem pagamento envolvido, sem transação própria). */
export async function markProposalDecision(
  ctx: TenantContext,
  proposalId: string,
  data: { decision: ProposalDecision; reviewedBy: string; reviewNote?: string },
): Promise<void> {
  await getDb(ctx, (db) =>
    db
      .update(reconciliationProposals)
      .set({
        decision: data.decision,
        reviewedBy: data.reviewedBy,
        reviewedAt: new Date(),
        reviewNote: data.reviewNote ?? null,
      })
      .where(
        and(eq(reconciliationProposals.tenantId, ctx.tenantId), eq(reconciliationProposals.id, proposalId)),
      ),
  );
}

/**
 * `SELECT ... FOR UPDATE` — usada por `approveReceiptProposal`
 * (`infra/payment-repository.ts`) dentro da MESMA transação que aplica o
 * pagamento, para proteger contra duplo clique/duas abas aprovando a
 * mesma proposta ao mesmo tempo (mesmo padrão de
 * `lockInstallmentsByContractTx`, módulo `contracts`).
 */
export async function lockProposalByIdTx(
  db: TenantDb,
  tenantId: string,
  proposalId: string,
): Promise<Proposal | null> {
  const rows = await db
    .select()
    .from(reconciliationProposals)
    .where(and(eq(reconciliationProposals.tenantId, tenantId), eq(reconciliationProposals.id, proposalId)))
    .for("update");
  return rows[0] ? toProposal(rows[0]) : null;
}

export async function markProposalReviewedTx(
  db: TenantDb,
  tenantId: string,
  proposalId: string,
  data: { decision: ProposalDecision; paymentId: string | null; reviewedBy: string; reviewNote?: string },
): Promise<void> {
  await db
    .update(reconciliationProposals)
    .set({
      decision: data.decision,
      paymentId: data.paymentId,
      reviewedBy: data.reviewedBy,
      reviewedAt: new Date(),
      reviewNote: data.reviewNote ?? null,
    })
    .where(and(eq(reconciliationProposals.tenantId, tenantId), eq(reconciliationProposals.id, proposalId)));
}
