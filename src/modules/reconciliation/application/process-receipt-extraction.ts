/**
 * Orquestra identificação de pagador (§6.3) → seleção de contrato
 * (§6.4) → alocação + decisão de auto-aplicação (§6.6) para UM
 * comprovante já extraído — chamado pelo worker depois de
 * `saveExtraction`. Sem I/O direto: tudo entra via `deps`.
 *
 * Sempre grava uma `reconciliation_proposals` (auditoria — spec §5.3),
 * mesmo quando a extração não deu identificação/contrato/valor
 * suficiente para sequer tentar alocar; nesses casos de "não dá pra
 * tentar" o caminho é `deps.createProposal` direto (sem lock de
 * parcelas, não há contrato pra travar). Quando HÁ payerId + contractId
 * + valor + data, a decisão real (auto-aplicar ou revisar) é sempre de
 * `deps.executeReceiptPayment` — nunca decidida aqui, para não duplicar
 * a lógica de `decideAutoApply` nem abrir uma janela de corrida entre
 * "decidir" e "gravar" (ver comentário em infra/payment-repository.ts).
 */

import type { TenantContext } from "@/db/client";
import type { Money } from "@/shared/money";
import type { ExtractionOutput } from "@/modules/ingestion";
import { identifyPayer, type Payer } from "@/modules/payers";
import type { Contract, Installment } from "@/modules/contracts";
import { selectTarget, type ContractCandidate } from "../domain/select-target";
import type { AllocatableInstallment } from "../domain/types";
import type { NewProposal } from "../infra/proposal-repository";
import type {
  ReceiptPaymentInput,
  ReceiptPaymentOutcome,
  RegisterManualPaymentError,
} from "../infra/payment-repository";
import type { Result } from "@/shared/result";
import { isErr } from "@/shared/result";

export interface ProcessReceiptExtractionInput {
  readonly receiptId: string;
  readonly extraction: ExtractionOutput;
  /** E.164, sem prefixo `whatsapp:` — ausente para outras origens (`upload`/`email`/`api`). */
  readonly fromPhone?: string;
}

export interface ProcessReceiptExtractionDeps {
  listPayers(): Promise<readonly Payer[]>;
  listContractsByPayer(payerId: string): Promise<readonly Contract[]>;
  listInstallmentsByContract(contractId: string): Promise<readonly Installment[]>;
  getAutoApprovalCeilingCents(): Promise<Money>;
  executeReceiptPayment(
    input: ReceiptPaymentInput,
  ): Promise<Result<ReceiptPaymentOutcome, RegisterManualPaymentError>>;
  createProposal(data: NewProposal): Promise<{ proposalId: string }>;
}

export type ProcessReceiptExtractionResult = "applied" | "review";

function toAllocatable(installment: Installment): AllocatableInstallment {
  return {
    id: installment.id,
    dueDate: installment.dueDate,
    amountCents: installment.amountCents,
    fineCents: installment.fineCents,
    interestCents: installment.interestCents,
    paidCents: installment.paidCents,
    status: installment.status,
  };
}

/** Grava a proposta "não dá pra tentar" (sem payerId, sem contrato, ou sem dado suficiente) — sempre `needs_review`, nunca decide nada além disso. */
async function reviewWithoutTarget(
  input: ProcessReceiptExtractionInput,
  deps: ProcessReceiptExtractionDeps,
): Promise<ProcessReceiptExtractionResult> {
  await deps.createProposal({
    receiptId: input.receiptId,
    paymentId: null,
    proposedAllocations: [],
    confidence: input.extraction.confidence,
    decision: "needs_review",
  });
  return "review";
}

export async function processReceiptExtraction(
  ctx: TenantContext,
  input: ProcessReceiptExtractionInput,
  deps: ProcessReceiptExtractionDeps,
): Promise<ProcessReceiptExtractionResult> {
  void ctx; // deps já chegam com o tenant amarrado (infra) — mesmo padrão do resto do projeto.

  const { extraction } = input;

  // Sem valor ou sem data pagos não dá pra alocar nem checar plausibilidade
  // de data (spec §7.4: "nunca chutar") — revisão direta.
  if (extraction.amount_cents === null || extraction.paid_at === null) {
    return reviewWithoutTarget(input, deps);
  }
  const amountCents = extraction.amount_cents;
  const paidAt = new Date(extraction.paid_at);

  const payers = await deps.listPayers();
  const identification = identifyPayer(payers, {
    ...(input.fromPhone ? { fromPhone: input.fromPhone } : {}),
    documentMasked: extraction.payer_document_masked,
    name: extraction.payer_name,
  });
  if (identification.tier === null) {
    return reviewWithoutTarget(input, deps);
  }
  const payerId = identification.payerId;
  // Já em memória (deps.listPayers() já buscou todos pra rodar identifyPayer)
  // — nunca busca o pagador de novo só pra pegar o telefone cadastrado.
  const payerPhoneE164 = payers.find((p) => p.id === payerId)?.phoneE164 ?? null;

  const contracts = await deps.listContractsByPayer(payerId);
  const activeContracts = contracts.filter((c) => c.status === "active");
  const candidates: ContractCandidate[] = await Promise.all(
    activeContracts.map(async (contract) => ({
      contractId: contract.id,
      status: contract.status,
      installments: (await deps.listInstallmentsByContract(contract.id)).map(toAllocatable),
    })),
  );

  const target = selectTarget(candidates, amountCents);
  if (target.outcome !== "selected") {
    return reviewWithoutTarget(input, deps);
  }

  const ceilingCents = await deps.getAutoApprovalCeilingCents();

  const outcome = await deps.executeReceiptPayment({
    payerId,
    contractId: target.contractId,
    receiptId: input.receiptId,
    amountCents,
    paidAt,
    method: extraction.method === "unknown" ? "other" : extraction.method,
    ...(extraction.transaction_ref ? { transactionRef: extraction.transaction_ref } : {}),
    confidence: extraction.confidence,
    fieldConfidence: extraction.field_confidence,
    identificationTier: identification.tier,
    ceilingCents,
    referenceDate: new Date(),
    ...(input.fromPhone ? { fromPhone: input.fromPhone } : {}),
    payerPhoneE164,
  });

  if (isErr(outcome)) {
    // `contract_not_found`/`no_eligible_installments`/`duplicate_transaction`
    // são falhas de infraestrutura/concorrência, não de julgamento — mesma
    // resposta segura de qualquer condição não atendida: revisão humana.
    return reviewWithoutTarget(input, deps);
  }

  return outcome.value.decision === "auto_applied" ? "applied" : "review";
}
