/**
 * Registro manual de pagamento — spec §14 Fase 1 ("sem IA, sem
 * WhatsApp"). Validação de forma aqui; a transação de verdade (lock,
 * motor de alocação, escrita em payments/allocations/installments/
 * ledger) vive em `infra/payment-repository.ts` porque precisa ser uma
 * única unidade atômica — não dá pra quebrar em `deps` menores sem
 * perder a garantia de tudo-ou-nada.
 */

import type { TenantContext } from "@/db/client";
import type { Result } from "@/shared/result";
import { err } from "@/shared/result";
import { isNegative, isZero } from "@/shared/money";
import type { RegisterManualPaymentError as ExecuteError } from "../infra/payment-repository";
import type { RegisterManualPaymentInput } from "../domain/types";

export interface RegisterManualPaymentDeps {
  executePayment(
    input: RegisterManualPaymentInput,
  ): Promise<Result<{ paymentId: string }, ExecuteError>>;
}

export type RegisterManualPaymentError = "invalid_amount" | ExecuteError;

export async function registerManualPayment(
  ctx: TenantContext,
  input: RegisterManualPaymentInput,
  deps: RegisterManualPaymentDeps,
): Promise<Result<{ paymentId: string }, RegisterManualPaymentError>> {
  void ctx; // deps.executePayment já chega com o tenant amarrado (infra) — mesmo padrão do resto do projeto.

  if (isZero(input.amountCents) || isNegative(input.amountCents)) {
    return err("invalid_amount");
  }

  return deps.executePayment(input);
}
