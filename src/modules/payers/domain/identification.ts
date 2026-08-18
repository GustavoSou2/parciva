/**
 * Identificação de pagador — spec §6.3. Sem I/O: recebe a lista de
 * pagadores do tenant (já carregada por quem chama) e os dados
 * extraídos do comprovante, devolve o vencedor (ou candidatos).
 *
 * Só 3 dos 4 tiers da spec: telefone, documento mascarado, nome
 * fuzzy. O item 4 (referência externa no campo de mensagem do PIX,
 * ex. "CTR-00432") fica de fora — `ExtractionOutput` não tem esse
 * campo hoje, e adicioná-lo mudaria o contrato de extração inteiro
 * (schema JSON, prompts de VLM), mais fundo que este marco.
 *
 * Documento: a spec fala em "CPF/CNPJ extraído → payers.document_hash",
 * mas isso não bate com o que a extração realmente produz — só o
 * documento MASCARADO (`payer_document_masked`, ex. "***.123.456-**"),
 * nunca o completo (comprovante de PIX não expõe CPF/CNPJ inteiro por
 * design). Não dá pra hashear um valor mascarado e comparar com hash do
 * valor completo — a comparação aqui é string exata entre os dois
 * mascarados.
 */

import type { Payer } from "./types";

export type IdentificationTier = "phone" | "document" | "name";

export interface IdentificationInput {
  readonly fromPhone?: string | null;
  readonly documentMasked?: string | null;
  readonly name?: string | null;
}

export interface IdentificationCandidate {
  readonly payerId: string;
  readonly name: string;
  readonly score: number;
}

export type IdentificationResult =
  | { readonly tier: IdentificationTier; readonly payerId: string }
  | { readonly tier: null; readonly candidates: readonly IdentificationCandidate[] };

const COMPANY_SUFFIXES = /\b(LTDA|ME|EIRELI|SA|S\/A|MEI)\b\.?/g;
const NAME_SIMILARITY_THRESHOLD = 0.88;
const MAX_CANDIDATES = 3;

/** Sem acento, caixa alta, sem sufixo societário, espaços colapsados — mesmo espírito de `shared/document.ts`, mas para nome. */
function normalizeName(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(COMPANY_SUFFIXES, "")
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshteinDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const distances: number[][] = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));

  for (let i = 0; i < rows; i++) distances[i]![0] = i;
  for (let j = 0; j < cols; j++) distances[0]![j] = j;

  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      distances[i]![j] = Math.min(
        distances[i - 1]![j]! + 1,
        distances[i]![j - 1]! + 1,
        distances[i - 1]![j - 1]! + cost,
      );
    }
  }

  return distances[rows - 1]![cols - 1]!;
}

/** 1 = idêntico, 0 = totalmente diferente. Duas strings vazias contam como idênticas (caso degenerado, não deveria aparecer com nome real). */
function nameSimilarity(a: string, b: string): number {
  const maxLength = Math.max(a.length, b.length);
  if (maxLength === 0) return 1;
  return 1 - levenshteinDistance(a, b) / maxLength;
}

export function identifyPayer(
  payers: readonly Payer[],
  input: IdentificationInput,
): IdentificationResult {
  if (input.fromPhone) {
    const match = payers.find((p) => p.phoneE164 === input.fromPhone);
    if (match) return { tier: "phone", payerId: match.id };
  }

  if (input.documentMasked) {
    const match = payers.find((p) => p.documentMasked === input.documentMasked);
    if (match) return { tier: "document", payerId: match.id };
  }

  if (input.name) {
    const normalizedInput = normalizeName(input.name);
    const scored = payers
      .map((p) => ({ payerId: p.id, name: p.name, score: nameSimilarity(normalizedInput, normalizeName(p.name)) }))
      .sort((a, b) => b.score - a.score);

    const best = scored[0];
    if (best && best.score >= NAME_SIMILARITY_THRESHOLD) {
      return { tier: "name", payerId: best.payerId };
    }
    if (scored.length > 0) {
      return { tier: null, candidates: scored.slice(0, MAX_CANDIDATES) };
    }
  }

  return { tier: null, candidates: [] };
}
