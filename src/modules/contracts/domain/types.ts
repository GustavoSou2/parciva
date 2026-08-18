/**
 * Tipos puros de contratos e parcelas — spec §5.2. Sem I/O.
 */

import type { Money } from "@/shared/money";

export type EarlyPaymentPolicy = "reduce_count" | "reduce_amount" | "credit_balance";

export type InstallmentStatus =
  | "pending"
  | "partial"
  | "paid"
  | "overdue"
  | "cancelled"
  | "written_off";

export interface Contract {
  readonly id: string;
  readonly payerId: string;
  readonly externalRef: string | null;
  readonly description: string | null;
  readonly principalCents: Money;
  readonly installmentsCount: number;
  readonly earlyPaymentPolicy: EarlyPaymentPolicy;
  readonly toleranceCents: Money;
  readonly startDate: string;
  readonly status: string;
}

export interface Installment {
  readonly id: string;
  readonly contractId: string;
  readonly number: number;
  readonly dueDate: string;
  readonly amountCents: Money;
  readonly fineCents: Money;
  readonly interestCents: Money;
  readonly paidCents: Money;
  readonly status: InstallmentStatus;
  readonly version: number;
}

export interface NewContractInput {
  readonly payerId: string;
  readonly externalRef?: string;
  readonly description?: string;
  readonly principalCents: Money;
  readonly installmentsCount: number;
  readonly earlyPaymentPolicy?: EarlyPaymentPolicy;
  readonly toleranceCents?: Money;
  readonly startDate: string;
}

/** Uma linha do cronograma gerado — ainda sem id, pronta para persistir. */
export interface InstallmentSchedule {
  readonly number: number;
  readonly dueDate: string;
  readonly amountCents: Money;
}
