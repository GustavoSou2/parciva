/**
 * Validação pura de cadastro de pagador — sem I/O. Documento é opcional
 * no cadastro (nem todo pagador chega com CPF/CNPJ conhecido — spec
 * §6.3 identifica por telefone/nome quando o documento falta), mas
 * quando informado precisa ser um CPF ou CNPJ válido (CLAUDE.md
 * invariante 10 — toda lógica de documento vem de `shared/document.ts`,
 * nunca duplicada aqui).
 */

import type { Result } from "@/shared/result";
import { err, ok } from "@/shared/result";
import { detectDocumentType, maskDocument, normalizeDocument } from "@/shared/document";
import type { NewPayerInput, ValidatedPayer } from "./types";

export type ValidatePayerError = "empty_name" | "invalid_document";

export function validateNewPayer(input: NewPayerInput): Result<ValidatedPayer, ValidatePayerError> {
  const name = input.name.trim();
  if (!name) {
    return err("empty_name");
  }

  const rawDocument = input.document?.trim();
  if (!rawDocument) {
    return ok({
      name,
      documentType: "none",
      document: null,
      documentMasked: null,
      phoneE164: input.phoneE164?.trim() || null,
      email: input.email?.trim() || null,
    });
  }

  const documentType = detectDocumentType(rawDocument);
  if (!documentType) {
    return err("invalid_document");
  }

  return ok({
    name,
    documentType,
    document: normalizeDocument(rawDocument),
    documentMasked: maskDocument(rawDocument, documentType),
    phoneE164: input.phoneE164?.trim() || null,
    email: input.email?.trim() || null,
  });
}
