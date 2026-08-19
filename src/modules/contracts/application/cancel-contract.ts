/**
 * Cancelar contrato — nunca `DELETE` (decisão do usuário, mesmo espírito
 * de `payments.status: "reversed"`). A transação de verdade (travar
 * parcelas, marcar `cancelled`) vive em `infra/contract-repository.ts`
 * (`cancelContractTx`) — aqui só a checagem de "já cancelado".
 */

import type { TenantContext } from "@/db/client";
import type { Result } from "@/shared/result";
import { err, ok } from "@/shared/result";
import type { Contract } from "../domain/types";

export interface CancelContractDeps {
  getContractById(contractId: string): Promise<Contract | null>;
  cancelContractTx(contractId: string): Promise<void>;
}

export type CancelContractError = "contract_not_found" | "already_cancelled";

export async function cancelContract(
  ctx: TenantContext,
  contractId: string,
  deps: CancelContractDeps,
): Promise<Result<void, CancelContractError>> {
  void ctx; // deps já chegam com o tenant amarrado (infra) — mesmo padrão do resto do projeto.

  const contract = await deps.getContractById(contractId);
  if (!contract) return err("contract_not_found");
  if (contract.status === "cancelled") return err("already_cancelled");

  await deps.cancelContractTx(contractId);
  return ok(undefined);
}
