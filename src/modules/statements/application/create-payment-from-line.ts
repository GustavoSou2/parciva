/**
 * Caminho manual — um humano escolheu pagador/contrato pra uma linha
 * de extrato sem match automático (Fase 5, fatia 2). Nunca automático,
 * sempre ação humana explícita (decisão do usuário). Mesma validação
 * de valor de `reconciliation/application/register-manual-payment.ts`.
 */

import type { Result } from "@/shared/result";
import { err, isErr } from "@/shared/result";
import { isNegative, isZero } from "@/shared/money";
import type {
  RegisterManualPaymentError,
  RegisterManualPaymentInput,
} from "@/modules/reconciliation";

export interface CreatePaymentFromLineDeps {
  executeStatementPayment(
    input: RegisterManualPaymentInput,
  ): Promise<Result<{ paymentId: string }, RegisterManualPaymentError>>;
  markStatementLineMatched(lineId: string, paymentId: string): Promise<void>;
}

export type CreatePaymentFromLineError = "invalid_amount" | RegisterManualPaymentError;

export async function createPaymentFromLine(
  lineId: string,
  input: RegisterManualPaymentInput,
  deps: CreatePaymentFromLineDeps,
): Promise<Result<{ paymentId: string }, CreatePaymentFromLineError>> {
  if (isZero(input.amountCents) || isNegative(input.amountCents)) {
    return err("invalid_amount");
  }

  const result = await deps.executeStatementPayment(input);
  if (isErr(result)) return result;

  await deps.markStatementLineMatched(lineId, result.value.paymentId);
  return result;
}
