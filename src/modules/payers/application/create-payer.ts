/**
 * Cadastro de pagador — spec §5.2/§14 Fase 1. `deps.documentHashPepper`
 * entra via deps (nunca lido de `process.env` aqui) para manter este
 * arquivo livre de I/O direto — quem monta os deps (infra) decide de
 * onde o pepper vem (hoje `DOCUMENT_HASH_PEPPER`).
 */

import type { TenantContext } from "@/db/client";
import type { Result } from "@/shared/result";
import { err, isErr, ok } from "@/shared/result";
import { hashDocument } from "@/shared/document";
import type { NewPayerInput, ValidatedPayer } from "../domain/types";
import { validateNewPayer, type ValidatePayerError } from "../domain/validate-payer";

export interface CreatePayerDeps {
  documentHashPepper: string;
  documentHashExists(hash: string): Promise<boolean>;
  savePayer(data: ValidatedPayer & { documentHash: string | null }): Promise<{ payerId: string }>;
}

export type CreatePayerError = ValidatePayerError | "duplicate_document";

export async function createPayer(
  ctx: TenantContext,
  input: NewPayerInput,
  deps: CreatePayerDeps,
): Promise<Result<{ payerId: string }, CreatePayerError>> {
  // ctx não é usado diretamente — deps.savePayer/documentHashExists já
  // chegam com o tenant amarrado por quem os monta (infra), mesmo padrão
  // de src/modules/ingestion/application/ingest-receipt.ts.
  void ctx;

  const validated = validateNewPayer(input);
  if (isErr(validated)) return validated;

  const documentHash = validated.value.document
    ? hashDocument(validated.value.document, deps.documentHashPepper)
    : null;

  if (documentHash && (await deps.documentHashExists(documentHash))) {
    return err("duplicate_document");
  }

  const { payerId } = await deps.savePayer({ ...validated.value, documentHash });
  return ok({ payerId });
}
