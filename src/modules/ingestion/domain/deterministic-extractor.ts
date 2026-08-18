/**
 * Tier 1 da cascata — spec §7.1/§7.2: extrai por regex, sem chamar
 * nenhum modelo. Domain puro: só string in, `Partial<ExtractionOutput>`
 * out. Campo não encontrado com confiança fica AUSENTE, nunca `null` —
 * `null` é reservado para "o extrator olhou e concluiu que não dá para
 * saber" (ambiguidade), que aqui é tratado deixando o campo de fora.
 *
 * Cada `extractX` devolve um fragmento e `extractFromText` funde tudo
 * por spread, em vez de mutar um objeto compartilhado — os campos de
 * `ExtractionOutput` são `readonly`, então mutação não compila.
 */

import { fromReais } from "@/shared/money";
import type { ExtractionOutput } from "./types";

/** E2E do PIX: "E" + 8 dígitos ISPB + 12 dígitos timestamp + 11 alfanuméricos = 32 chars. */
const E2E_ID_REGEX = /\bE(\d{8})(\d{12})([0-9A-Za-z]{11})\b/;

/** R$ com separadores brasileiros — milhar por ponto, decimal por vírgula com 2 dígitos. */
const AMOUNT_REGEX = /R\$\s?\d{1,3}(?:\.\d{3})*,\d{2}/;

/** dd/mm/aaaa, com hora opcional "hh:mm" ou "às hh:mm". */
const DATE_REGEX = /\b(\d{2})\/(\d{2})\/(\d{4})(?:\s+(?:às\s+)?(\d{2}):(\d{2}))?\b/i;

/** Mascarado não tem DV completo — só captura o formato, nunca valida. */
const MASKED_CPF_REGEX = /\*{3}\.\d{3}\.\d{3}-\*{2}/;
const MASKED_CNPJ_REGEX = /\d{2}\.\d{3}\.\*{3}\/\*{4}-\d{2}/;
const PAYER_KEYWORD_REGEX = /pagador/i;
const PAYEE_KEYWORD_REGEX = /(recebedor|favorecido|benefici[aá]rio|destinat[aá]rio)/i;

/** Dicionário mínimo por ISPB — spec §7.2, os 8 maiores bancos/PSPs brasileiros. */
const ISPB_INSTITUTIONS: Readonly<Record<string, string>> = {
  "00000000": "Banco do Brasil",
  "60746948": "Bradesco",
  "00360305": "Caixa Econômica Federal",
  "60701190": "Itaú Unibanco",
  "90400888": "Santander",
  "18236120": "Nubank",
  "00416968": "Banco Inter",
  "10573521": "Mercado Pago",
};

function extractTransactionRefAndInstitution(text: string): Partial<ExtractionOutput> {
  const match = E2E_ID_REGEX.exec(text);
  if (!match) return {};

  const ispb = match[1] as string;
  const institution = ISPB_INSTITUTIONS[ispb];

  return {
    transaction_ref: match[0],
    ...(institution ? { institution } : {}),
  };
}

/**
 * Formato ambíguo (ex.: "1.500" sem `R$` e sem centavos) simplesmente
 * não casa com o regex — não existe caminho de código que "chute" um
 * valor a partir disso, por construção (spec §7.4).
 */
function extractAmount(text: string): Partial<ExtractionOutput> {
  const match = AMOUNT_REGEX.exec(text);
  if (!match) return {};

  const numeric = match[0].replace("R$", "").trim().replace(/\./g, "");
  try {
    return { amount_cents: fromReais(numeric) };
  } catch {
    // Formato bateu no regex mas fromReais rejeitou (ex.: 3+ casas
    // decimais coladas por engano) — ausência é mais segura que exceção
    // aqui, já que Tier 1 nunca deve derrubar o pipeline de ingestão.
    return {};
  }
}

/**
 * Hora ausente não vira "00:00:00" — isso seria chutar um horário que o
 * texto não informou; sem hora, `paid_at` fica AUSENTE (não um valor
 * inventado). Com hora, o comprovante brasileiro de PIX mostra horário
 * local (America/Sao_Paulo, sem DST desde 2019) — produz `-03:00`
 * explícito, nunca `Z` (que seria afirmar UTC, informação que o texto
 * não dá). `z.string().datetime({ offset: true })` (extraction-schema.ts)
 * exige exatamente esse formato com offset numérico.
 */
function extractPaidAt(text: string): Partial<ExtractionOutput> {
  const match = DATE_REGEX.exec(text);
  if (!match) return {};

  const [, day, month, year, hour, minute] = match;
  if (!hour || !minute) return {};

  return { paid_at: `${year}-${month}-${day}T${hour}:${minute}:00-03:00` };
}

/**
 * Associa o documento mascarado ao papel (pagador/recebedor) só quando a
 * mesma linha traz a palavra-chave correspondente. Sem essa co-ocorrência
 * não há como saber de quem é o documento — melhor deixar ausente do que
 * chutar o papel errado.
 */
function extractMaskedDocuments(text: string): Partial<ExtractionOutput> {
  let payerDocumentMasked: string | undefined;
  let payeeDocumentMasked: string | undefined;

  for (const line of text.split(/\n+/)) {
    const masked = (MASKED_CPF_REGEX.exec(line) ?? MASKED_CNPJ_REGEX.exec(line))?.[0];
    if (!masked) continue;

    if (!payerDocumentMasked && PAYER_KEYWORD_REGEX.test(line)) {
      payerDocumentMasked = masked;
    } else if (!payeeDocumentMasked && PAYEE_KEYWORD_REGEX.test(line)) {
      payeeDocumentMasked = masked;
    }
  }

  return {
    ...(payerDocumentMasked ? { payer_document_masked: payerDocumentMasked } : {}),
    ...(payeeDocumentMasked ? { payee_document_masked: payeeDocumentMasked } : {}),
  };
}

export function extractFromText(text: string): Partial<ExtractionOutput> {
  return {
    ...extractTransactionRefAndInstitution(text),
    ...extractAmount(text),
    ...extractPaidAt(text),
    ...extractMaskedDocuments(text),
  };
}
