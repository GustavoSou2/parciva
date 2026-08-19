"use server";

import { redirect } from "next/navigation";
import { requireTenantSession } from "@/app/_lib/require-tenant-session";
import { formString } from "@/app/_lib/form-data";
import {
  approveReceiptProposal,
  markProposalDecision,
  type PaymentMethod,
} from "@/modules/reconciliation";
import { requirePermission } from "@/modules/identity";
import { updateReceiptStatus } from "@/modules/ingestion";
import { fromReais } from "@/shared/money";
import { isErr } from "@/shared/result";

/**
 * Aprovar na fila de revisão (Marco 5) — sempre por decisão humana
 * explícita (spec §6.6, invariante 5 do CLAUDE.md: "na dúvida, revisão
 * humana"), nunca reaproveitando a alocação calculada quando a proposta
 * foi criada (`approveReceiptProposal` recalcula na hora, dentro do
 * lock). `updateReceiptStatus` roda DEPOIS da transação de pagamento —
 * mesmo padrão de `receipt-worker.ts`: status de `receipts` é
 * side-effect, não parte da transação financeira.
 *
 * `receipts:approve` (não `payments:write`) — achado em 19/08/2026: esta
 * action nunca checava permissão nenhuma, então qualquer membro do
 * tenant, inclusive `viewer` (só leitura por design), conseguia aplicar
 * pagamento real por aqui. `receipts:approve` já existia em
 * `ROLE_PERMISSIONS` desde a fundação (spec: "Operador... aprova/
 * rejeita, não mexe em contrato") — nunca tinha sido ligado a rota
 * nenhuma até agora, mesma situação do CSRF antes da decisão [22].
 */
export async function approveReviewAction(
  tenantSlug: string,
  proposalId: string,
  receiptId: string,
  formData: FormData,
): Promise<void> {
  const session = await requireTenantSession(tenantSlug);
  if (isErr(requirePermission(session.role, "receipts:approve"))) {
    redirect(`/t/${tenantSlug}/review/${proposalId}?error=unauthorized`);
  }
  const ctx = { tenantId: session.tenantId };

  const payerId = formString(formData, "payerId");
  const contractId = formString(formData, "contractId");
  const method = (formString(formData, "method") || "pix") as PaymentMethod;
  const transactionRef = formString(formData, "transactionRef").trim() || undefined;
  const paidAtRaw = formString(formData, "paidAt");

  let amountCents;
  try {
    amountCents = fromReais(formString(formData, "amount") || "0");
  } catch {
    redirect(`/t/${tenantSlug}/review/${proposalId}?error=invalid_amount`);
  }

  const result = await approveReceiptProposal(ctx, {
    proposalId,
    receiptId,
    payerId,
    contractId,
    amountCents,
    paidAt: paidAtRaw ? new Date(paidAtRaw) : new Date(),
    method,
    ...(transactionRef ? { transactionRef } : {}),
    actorUserId: session.userId,
  });

  if (isErr(result)) {
    redirect(`/t/${tenantSlug}/review/${proposalId}?error=${result.error}`);
  }

  await updateReceiptStatus(ctx, receiptId, "applied");
  redirect(`/t/${tenantSlug}/review`);
}

/** Rejeitar — sem pagamento envolvido, só marca a proposta e o comprovante. */
export async function rejectReviewAction(
  tenantSlug: string,
  proposalId: string,
  receiptId: string,
  formData: FormData,
): Promise<void> {
  const session = await requireTenantSession(tenantSlug);
  if (isErr(requirePermission(session.role, "receipts:approve"))) {
    redirect(`/t/${tenantSlug}/review/${proposalId}?error=unauthorized`);
  }
  const ctx = { tenantId: session.tenantId };
  const reviewNote = formString(formData, "reviewNote").trim() || undefined;

  await markProposalDecision(ctx, proposalId, {
    decision: "rejected",
    reviewedBy: session.userId,
    ...(reviewNote ? { reviewNote } : {}),
  });
  await updateReceiptStatus(ctx, receiptId, "rejected");
  redirect(`/t/${tenantSlug}/review`);
}
