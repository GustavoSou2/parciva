/**
 * `reconciliation_proposals` — spec §5.3, log de auditoria de toda
 * decisão do motor para o caminho `origin=receipt` (auto-aplicada ou
 * não). `createProposalTx` roda dentro da MESMA transação que decide
 * aplicar o pagamento (`infra/payment-repository.ts`) — uma linha
 * sempre é gravada, auto-aplicada ou não; nunca condicional.
 */

import { and, eq } from "drizzle-orm";
import { getDb, type TenantContext, type TenantDb } from "@/db/client";
import { reconciliationProposals } from "@/db/schema/financial";
import type { AllocationLine } from "../domain/types";

export type ProposalDecision = "auto_applied" | "needs_review" | "rejected";

export interface NewProposal {
  readonly receiptId: string;
  readonly paymentId: string | null;
  readonly proposedAllocations: readonly AllocationLine[];
  readonly confidence: number;
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

/** Fila de revisão humana (spec §6.6) — sem UI que chame isto ainda; infra pronta para o marco que adicionar a tela. */
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
