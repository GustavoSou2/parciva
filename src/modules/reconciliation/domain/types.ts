/**
 * Tipos puros do motor de alocação — spec §6. Sem I/O.
 */

import type { Money } from "@/shared/money";
import type { EarlyPaymentPolicy, InstallmentStatus } from "@/modules/contracts";

/** O motor só precisa desses campos de cada parcela — nunca o objeto inteiro do banco. */
export interface AllocatableInstallment {
  readonly id: string;
  readonly dueDate: string;
  readonly amountCents: Money;
  readonly fineCents: Money;
  readonly interestCents: Money;
  readonly paidCents: Money;
  readonly status: InstallmentStatus;
}

export type AllocationKind = "interest" | "fine" | "principal";

export interface AllocationLine {
  readonly installmentId: string;
  readonly kind: AllocationKind;
  readonly amountCents: Money;
}

export interface InstallmentUpdate {
  readonly installmentId: string;
  readonly newPaidCents: Money;
  readonly newStatus: Extract<InstallmentStatus, "partial" | "paid">;
}

export interface AllocationResult {
  readonly allocations: readonly AllocationLine[];
  readonly installmentUpdates: readonly InstallmentUpdate[];
  /** > 0 só quando todas as parcelas elegíveis (vencidas + futuras, conforme a política) foram esgotadas e ainda sobrou valor. */
  readonly remainingCents: Money;
}

export interface AllocationOptions {
  readonly toleranceCents: Money;
  readonly earlyPaymentPolicy: EarlyPaymentPolicy;
  /** "Hoje" para efeito de separar parcelas vencidas de futuras (§6.5 passo 3) — normalmente `paidAt`. */
  readonly referenceDate: string;
}

export type PaymentMethod = "pix" | "ted" | "doc" | "boleto" | "cash" | "card" | "other";

/** Registro manual — spec §14 Fase 1 ("sem IA, sem WhatsApp"): sempre decisão humana explícita, nunca passa por §6.6. */
export interface RegisterManualPaymentInput {
  readonly payerId: string;
  readonly contractId: string;
  readonly amountCents: Money;
  readonly paidAt: Date;
  readonly method: PaymentMethod;
  readonly transactionRef?: string;
  readonly actorUserId?: string;
}

export type ProposalDecision = "auto_applied" | "needs_review" | "rejected" | "reviewed_approved";

/** `reconciliation_proposals` — para a fila de revisão (Marco 5). */
export interface Proposal {
  readonly id: string;
  readonly receiptId: string;
  readonly paymentId: string | null;
  readonly proposedAllocations: readonly AllocationLine[];
  readonly confidence: number;
  readonly decision: ProposalDecision;
  readonly reviewedBy: string | null;
  readonly reviewedAt: Date | null;
  readonly reviewNote: string | null;
  readonly createdAt: Date;
}

/** `payments` — para exibição (histórico de pagamentos de um contrato/pagador). */
export interface Payment {
  readonly id: string;
  readonly payerId: string;
  readonly origin: string;
  readonly verificationLevel: string;
  readonly amountCents: Money;
  readonly paidAt: Date;
  readonly method: PaymentMethod;
  readonly transactionRef: string | null;
  readonly status: "proposed" | "applied" | "reversed" | "rejected";
  readonly createdAt: Date;
}
