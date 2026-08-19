/**
 * Parser de extrato CSV — Fase 5 (fatia 2, spec §8.1 Camada D). Hand-
 * rolled, sem dependência nova (decisão do usuário — mesmo espírito de
 * `logger.ts`/sessão opaca). Puro: string in, `ParsedStatementCsv` out.
 *
 * Escopo explícito, documentado (não é o formato de todo banco):
 * cabeçalho com sinônimos comuns em português; delimitador `,` ou `;`
 * (detectado pela linha de cabeçalho); valor em formato BR
 * (`1.234,56`) ou decimal simples com ponto (`150.00`, comum em banco
 * digital); UTF-8 assumido. Linha de débito (valor <= 0) é descartada
 * — só crédito importa pra casar com pagamento recebido. Linha
 * malformada é descartada individualmente (`skippedRows`), nunca
 * derruba o arquivo inteiro — mesmo espírito de "ausência em vez de
 * exceção" da cascata de extração de comprovante.
 */

import { fromReais, MoneyError, type Money } from "@/shared/money";
import type { Result } from "@/shared/result";
import { err, ok } from "@/shared/result";
import type { ParsedStatementCsv, ParsedStatementLine } from "./types";

export type ParseStatementCsvError = "empty" | "missing_headers";

const DATE_HEADER_ALIASES = ["data", "data lancamento", "data lançamento", "data mov", "data movimento"];
const DESCRIPTION_HEADER_ALIASES = [
  "historico",
  "histórico",
  "descricao",
  "descrição",
  "lancamento",
  "lançamento",
];
const AMOUNT_HEADER_ALIASES = ["valor", "valor (r$)", "valor(r$)"];

function normalizeHeader(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Detecta o delimitador pela linha de cabeçalho — bancos BR frequentemente exportam CSV com `;` (locale que usa `,` como decimal). */
function detectDelimiter(headerLine: string): "," | ";" {
  const semicolons = (headerLine.match(/;/g) ?? []).length;
  const commas = (headerLine.match(/,/g) ?? []).length;
  return semicolons > commas ? ";" : ",";
}

/** Split simples com suporte a campo entre aspas duplas (`"a, b"` não quebra em dois campos) — não é um parser RFC4180 completo, cobre o caso comum de extrato bancário. */
function splitCsvRow(line: string, delimiter: "," | ";"): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === delimiter && !inQuotes) {
      fields.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  fields.push(current.trim());
  return fields.map((field) => field.replace(/^"|"$/g, ""));
}

function findColumnIndex(headers: readonly string[], aliases: readonly string[]): number {
  return headers.findIndex((header) => aliases.includes(header));
}

/**
 * dd/mm/aaaa (BR) ou aaaa-mm-dd (ISO, comum em banco digital) — nunca
 * chuta hora, meio-dia UTC evita problema de fuso na exibição da data.
 * Valida por round-trip (não só o formato): `new Date` faz rollover
 * silencioso de mês/dia fora do calendário (ex.: mês 13 vira janeiro do
 * ano seguinte) — sem o round-trip, "31/13/2026" seria aceito como uma
 * data real, nunca chutar (mesmo espírito de §7.4, "nunca inventar
 * valor").
 */
function buildValidatedDate(year: string, month: string, day: string): Date | null {
  const date = new Date(`${year}-${month}-${day}T12:00:00Z`);
  const roundTrips =
    date.getUTCFullYear() === Number(year) &&
    date.getUTCMonth() + 1 === Number(month) &&
    date.getUTCDate() === Number(day);
  return roundTrips ? date : null;
}

function parseStatementDate(raw: string): Date | null {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
  if (iso) {
    const [, year, month, day] = iso;
    return buildValidatedDate(year as string, month as string, day as string);
  }
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw.trim());
  if (br) {
    const [, day, month, year] = br;
    return buildValidatedDate(year as string, month as string, day as string);
  }
  return null;
}

/**
 * Formato BR (`1.234,56`, vírgula decimal) detectado pela presença de
 * vírgula — dots de milhar são removidos antes de `fromReais` (mesmo
 * pré-processamento de `AMOUNT_REGEX`/`extractAmount` em
 * `ingestion/domain/deterministic-extractor.ts`). Sem vírgula, assume
 * decimal simples com ponto (`150.00`, comum em export de banco
 * digital) — passa direto pra `fromReais`.
 */
function parseStatementAmount(raw: string): Money | null {
  const trimmed = raw.trim().replace(/^R\$\s?/, "");
  if (!trimmed) return null;

  const normalized = trimmed.includes(",") ? trimmed.replace(/\./g, "") : trimmed;
  try {
    return fromReais(normalized);
  } catch (error) {
    if (error instanceof MoneyError) return null;
    throw error;
  }
}

export function parseStatementCsv(raw: string): Result<ParsedStatementCsv, ParseStatementCsvError> {
  const rawLines = raw.split(/\r\n|\n|\r/).filter((line) => line.trim().length > 0);
  if (rawLines.length === 0) return err("empty");

  const headerLine = rawLines[0] as string;
  const delimiter = detectDelimiter(headerLine);
  const headers = splitCsvRow(headerLine, delimiter).map(normalizeHeader);

  const dateIndex = findColumnIndex(headers, DATE_HEADER_ALIASES);
  const descriptionIndex = findColumnIndex(headers, DESCRIPTION_HEADER_ALIASES);
  const amountIndex = findColumnIndex(headers, AMOUNT_HEADER_ALIASES);
  if (dateIndex === -1 || descriptionIndex === -1 || amountIndex === -1) {
    return err("missing_headers");
  }

  const lines: ParsedStatementLine[] = [];
  let skippedRows = 0;

  for (const rawLine of rawLines.slice(1)) {
    const fields = splitCsvRow(rawLine, delimiter);
    const dateField = fields[dateIndex];
    const descriptionField = fields[descriptionIndex];
    const amountField = fields[amountIndex];

    const occurredAt = dateField ? parseStatementDate(dateField) : null;
    const amountCents = amountField ? parseStatementAmount(amountField) : null;

    if (!occurredAt || amountCents === null || !descriptionField) {
      skippedRows += 1;
      continue;
    }
    // Débito (valor <= 0) não interessa à conciliação — só crédito recebido casa com pagamento.
    if (amountCents <= 0) continue;

    lines.push({ occurredAt, description: descriptionField, amountCents });
  }

  return ok({ lines, skippedRows });
}
