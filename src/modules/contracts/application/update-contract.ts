/**
 * Editar contrato — só metadado (`description`/`externalRef`), decisão
 * do usuário: os campos estruturais (`principalCents`/
 * `installmentsCount`/`startDate`/`earlyPaymentPolicy`/`toleranceCents`)
 * já geraram o cronograma em `installments` na criação; editá-los depois
 * desincronizaria do que já foi (talvez) pago.
 */

import type { TenantContext } from "@/db/client";
import type { Result } from "@/shared/result";
import { err, ok } from "@/shared/result";

export interface UpdateContractInput {
  readonly description?: string;
  readonly externalRef?: string;
}

export interface UpdateContractDeps {
  externalRefExistsExcluding(externalRef: string, excludeContractId: string): Promise<boolean>;
  saveContractMetadata(data: { description: string | null; externalRef: string | null }): Promise<void>;
}

export type UpdateContractError = "duplicate_external_ref";

export async function updateContract(
  ctx: TenantContext,
  contractId: string,
  input: UpdateContractInput,
  deps: UpdateContractDeps,
): Promise<Result<void, UpdateContractError>> {
  void ctx; // deps já chegam com o tenant amarrado (infra) — mesmo padrão do resto do projeto.

  const externalRef = input.externalRef?.trim() || null;
  if (externalRef && (await deps.externalRefExistsExcluding(externalRef, contractId))) {
    return err("duplicate_external_ref");
  }

  await deps.saveContractMetadata({ description: input.description?.trim() || null, externalRef });
  return ok(undefined);
}
