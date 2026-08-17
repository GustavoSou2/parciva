/**
 * CPF e CNPJ — normalização, validação e hash.
 *
 * Regra central (CLAUDE.md, invariante 10): documento é SEMPRE texto,
 * nunca tipo numérico. CNPJ pode conter letras nas 12 primeiras posições
 * desde a IN RFB nº 2.229/2024 (CNPJ alfanumérico) — confirme a vigência
 * e as regras finais junto à Receita Federal antes de depender disto em
 * produção; este módulo implementa o desenho descrito na spec, não
 * substitui a norma oficial.
 *
 * Toda lógica de documento vive aqui. Não duplique regex de CPF/CNPJ em
 * nenhum outro arquivo do projeto — ver docs/spec/05-data-model.md §5.6.
 */

import { createHmac } from "node:crypto";

export type DocumentType = "cpf" | "cnpj";

export class DocumentError extends Error {}

/**
 * Remove pontuação e aplica caixa alta. Único ponto de normalização —
 * é o que garante que "12.abc.345/6789-01" e "12ABC345678901" produzem
 * o mesmo hash. Ver C-40 (mesmo documento, hash diferente por causa da
 * caixa) no catálogo de caos da spec.
 */
export function normalizeDocument(raw: string): string {
  return raw.replace(/[^0-9A-Za-z]/g, "").toUpperCase();
}

function charValue(ch: string): number {
  // Dígito: valor próprio. Letra: código ASCII - 48 (A=17 ... Z=42).
  // Regra do CNPJ alfanumérico — nunca usar parseInt/Number direto aqui,
  // pois letra não é dígito decimal.
  return ch.charCodeAt(0) - 48;
}

function weightedMod11DV(base: string, weights: readonly number[]): number {
  let sum = 0;
  for (let i = 0; i < weights.length; i++) {
    sum += charValue(base[i] as string) * (weights[i] as number);
  }
  const mod = sum % 11;
  return mod < 2 ? 0 : 11 - mod;
}

const CPF_DV1_WEIGHTS = [10, 9, 8, 7, 6, 5, 4, 3, 2] as const;
const CPF_DV2_WEIGHTS = [11, 10, 9, 8, 7, 6, 5, 4, 3, 2] as const;
const CNPJ_DV1_WEIGHTS = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] as const;
const CNPJ_DV2_WEIGHTS = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] as const;

/** CPF é sempre numérico — 11 dígitos, dois DVs. */
export function isValidCpf(raw: string): boolean {
  const doc = normalizeDocument(raw);
  if (!/^\d{11}$/.test(doc)) return false;

  // Sequências com todos os dígitos iguais (000... , 111... etc.) passam
  // pelo checksum por degenerescência da fórmula — precisam ser rejeitadas
  // explicitamente.
  if (/^(\d)\1{10}$/.test(doc)) return false;

  const dv1 = weightedMod11DV(doc.slice(0, 9), CPF_DV1_WEIGHTS);
  const dv2 = weightedMod11DV(doc.slice(0, 9) + dv1, CPF_DV2_WEIGHTS);

  return doc === doc.slice(0, 9) + String(dv1) + String(dv2);
}

/**
 * CNPJ — aceita numérico OU alfanumérico. As 12 primeiras posições podem
 * conter dígitos e/ou letras A-Z; os 2 dígitos verificadores são sempre
 * numéricos. Ver C-39 no catálogo de caos: um VLM tende a "corrigir"
 * letra para dígito parecido (O→0, I→1) — a validação de DV aqui é a
 * defesa determinística contra isso.
 */
export function isValidCnpj(raw: string): boolean {
  const doc = normalizeDocument(raw);
  if (!/^[0-9A-Z]{12}\d{2}$/.test(doc)) return false;

  const base = doc.slice(0, 12);
  const dv1 = weightedMod11DV(base, CNPJ_DV1_WEIGHTS);
  const dv2 = weightedMod11DV(base + String(dv1), CNPJ_DV2_WEIGHTS);

  return doc === base + String(dv1) + String(dv2);
}

export function isValidDocument(raw: string): boolean {
  return isValidCpf(raw) || isValidCnpj(raw);
}

export function detectDocumentType(raw: string): DocumentType | null {
  const doc = normalizeDocument(raw);
  if (doc.length === 11 && isValidCpf(doc)) return "cpf";
  if (doc.length === 14 && isValidCnpj(doc)) return "cnpj";
  return null;
}

/**
 * Máscara de exibição. Não valida — quem chama já deve ter validado.
 * CPF: XXX.XXX.XXX-XX  |  CNPJ: XX.XXX.XXX/XXXX-XX (aceita letra no corpo)
 */
export function maskDocument(raw: string, type: DocumentType): string {
  const doc = normalizeDocument(raw);
  if (type === "cpf") {
    if (doc.length !== 11) {
      throw new DocumentError(`CPF precisa ter 11 caracteres para mascarar, recebido: "${raw}"`);
    }
    return `${doc.slice(0, 3)}.${doc.slice(3, 6)}.${doc.slice(6, 9)}-${doc.slice(9, 11)}`;
  }
  if (doc.length !== 14) {
    throw new DocumentError(`CNPJ precisa ter 14 caracteres para mascarar, recebido: "${raw}"`);
  }
  return `${doc.slice(0, 2)}.${doc.slice(2, 5)}.${doc.slice(5, 8)}/${doc.slice(8, 12)}-${doc.slice(12, 14)}`;
}

/**
 * Hash determinístico com pepper, para indexação e dedupe de pagador
 * (payers.document_hash). Normaliza antes de gerar — normalizar depois
 * do hash não serve para nada, já teria gerado hash diferente.
 *
 * O pepper NUNCA fica no banco; vem de variável de ambiente / cofre.
 */
export function hashDocument(raw: string, pepper: string): string {
  if (!pepper) {
    throw new DocumentError("hashDocument chamado sem pepper — configure DOCUMENT_HASH_PEPPER.");
  }
  const normalized = normalizeDocument(raw);
  return createHmac("sha256", pepper).update(normalized).digest("hex");
}
