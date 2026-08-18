/**
 * Reversão de pagamento — spec §6.7 ("estorno de PIX após baixa
 * aplicada: lançamento de reversão, parcela volta a pending"). A
 * transação de verdade vive em `infra/payment-repository.ts`, mesmo
 * motivo de `register-manual-payment.ts`.
 */

import type { TenantContext } from "@/db/client";
import type { Result } from "@/shared/result";
import type { ReversePaymentError as ExecuteError } from "../infra/payment-repository";

export interface ReversePaymentDeps {
  executeReversal(paymentId: string, actorUserId: string | undefined): Promise<Result<void, ExecuteError>>;
}

export async function reversePayment(
  ctx: TenantContext,
  paymentId: string,
  actorUserId: string | undefined,
  deps: ReversePaymentDeps,
): Promise<Result<void, ExecuteError>> {
  void ctx; // deps.executeReversal já chega com o tenant amarrado (infra) — mesmo padrão do resto do projeto.
  return deps.executeReversal(paymentId, actorUserId);
}
