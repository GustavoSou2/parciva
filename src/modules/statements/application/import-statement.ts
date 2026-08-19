/**
 * Orquestra o upload de um extrato (Fase 5, fatia 2, spec §8.1 Camada
 * D): parseia o CSV (domain, puro) e, para cada linha de crédito,
 * tenta casar pelo E2E id extraído da descrição (`extractE2eId`,
 * `@/modules/ingestion` — mesmo regex do comprovante, nunca duplicado)
 * contra um pagamento já existente (`findPaymentByTransactionRef`,
 * `@/modules/reconciliation`). Match encontrado sobe
 * `verification_level` pra `statement` (idempotente — só sobe se
 * estiver abaixo, nunca desce). Sem match, a linha fica visível pra um
 * humano criar o pagamento manualmente (`create-payment-from-line.ts`)
 * — nunca automático.
 */

import type { Result } from "@/shared/result";
import { isErr, ok } from "@/shared/result";
import { extractE2eId } from "@/modules/ingestion";
import { parseStatementCsv, type ParseStatementCsvError } from "../domain/csv-parser";
import type { NewStatementLine, StatementMatchKind } from "../domain/types";
import type { RecordStatementImportInput } from "../infra/statement-repository";

export interface ImportStatementInput {
  readonly filename: string;
  readonly uploadedBy: string;
  readonly rawCsv: string;
}

export interface ImportStatementDeps {
  findPaymentByTransactionRef(ref: string): Promise<{ id: string; verificationLevel: string } | null>;
  upgradeVerificationLevelToStatement(paymentId: string): Promise<void>;
  recordStatementImport(input: RecordStatementImportInput): Promise<{ importId: string }>;
}

export interface ImportStatementResult {
  readonly importId: string;
  readonly lineCount: number;
  readonly matchedCount: number;
  readonly skippedRows: number;
}

export async function importStatement(
  input: ImportStatementInput,
  deps: ImportStatementDeps,
): Promise<Result<ImportStatementResult, ParseStatementCsvError>> {
  const parsed = parseStatementCsv(input.rawCsv);
  if (isErr(parsed)) return parsed;

  const resolvedLines: NewStatementLine[] = [];
  for (const line of parsed.value.lines) {
    const extractedRef = extractE2eId(line.description);
    let matchKind: StatementMatchKind | null = null;
    let matchedPaymentId: string | null = null;

    if (extractedRef) {
      const match = await deps.findPaymentByTransactionRef(extractedRef);
      if (match) {
        await deps.upgradeVerificationLevelToStatement(match.id);
        matchKind = "auto_e2e";
        matchedPaymentId = match.id;
      }
    }

    resolvedLines.push({ ...line, extractedRef, matchKind, matchedPaymentId });
  }

  const { importId } = await deps.recordStatementImport({
    filename: input.filename,
    uploadedBy: input.uploadedBy,
    lines: resolvedLines,
  });

  return ok({
    importId,
    lineCount: resolvedLines.length,
    matchedCount: resolvedLines.filter((line) => line.matchKind !== null).length,
    skippedRows: parsed.value.skippedRows,
  });
}
