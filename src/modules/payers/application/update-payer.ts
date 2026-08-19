/**
 * Editar cadastro de pagador — mesma forma de `create-payer.ts`, reusa
 * `validateNewPayer` sem duplicar a validação. Diferença: a checagem de
 * documento duplicado exclui o próprio pagador (editar sem trocar o
 * documento não deveria "colidir com si mesmo").
 */

import type { TenantContext } from "@/db/client";
import type { Result } from "@/shared/result";
import { err, isErr, ok } from "@/shared/result";
import { hashDocument } from "@/shared/document";
import type { NewPayerInput, ValidatedPayer } from "../domain/types";
import { validateNewPayer, type ValidatePayerError } from "../domain/validate-payer";

export interface UpdatePayerDeps {
  documentHashPepper: string;
  documentHashExistsExcluding(hash: string, excludePayerId: string): Promise<boolean>;
  savePayerUpdate(data: ValidatedPayer & { documentHash: string | null }): Promise<void>;
}

export type UpdatePayerError = ValidatePayerError | "duplicate_document";

export async function updatePayer(
  ctx: TenantContext,
  payerId: string,
  input: NewPayerInput,
  deps: UpdatePayerDeps,
): Promise<Result<void, UpdatePayerError>> {
  void ctx; // deps já chegam com o tenant amarrado (infra) — mesmo padrão de create-payer.ts.

  const validated = validateNewPayer(input);
  if (isErr(validated)) return validated;

  const documentHash = validated.value.document
    ? hashDocument(validated.value.document, deps.documentHashPepper)
    : null;

  if (documentHash && (await deps.documentHashExistsExcluding(documentHash, payerId))) {
    return err("duplicate_document");
  }

  await deps.savePayerUpdate({ ...validated.value, documentHash });
  return ok(undefined);
}
