import type { Money } from "@/shared/money";

/** Uma linha de CRÉDITO já parseada — débito é descartado em `csv-parser.ts`, nunca chega aqui. */
export interface ParsedStatementLine {
  readonly occurredAt: Date;
  readonly description: string;
  readonly amountCents: Money;
}

export interface ParsedStatementCsv {
  readonly lines: readonly ParsedStatementLine[];
  /** Linhas de dado que não puderam ser parseadas (data/valor inválido) — descartadas individualmente, nunca derrubam o arquivo inteiro. */
  readonly skippedRows: number;
}

export type StatementMatchKind = "auto_e2e" | "manual";

export interface StatementLine {
  readonly id: string;
  readonly statementImportId: string;
  readonly occurredAt: Date;
  readonly description: string;
  readonly amountCents: Money;
  readonly extractedRef: string | null;
  readonly matchKind: StatementMatchKind | null;
  readonly matchedPaymentId: string | null;
  readonly createdAt: Date;
}

export interface StatementImportSummary {
  readonly id: string;
  readonly filename: string;
  readonly lineCount: number;
  readonly matchedCount: number;
  readonly createdAt: Date;
}

/** Linha já resolvida (match tentado) — o que `application/import-statement.ts` monta antes de persistir. */
export interface NewStatementLine {
  readonly occurredAt: Date;
  readonly description: string;
  readonly amountCents: Money;
  readonly extractedRef: string | null;
  readonly matchKind: StatementMatchKind | null;
  readonly matchedPaymentId: string | null;
}
