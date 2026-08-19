// porta pública do módulo — só o que está aqui pode ser importado de fora.
export { parseStatementCsv } from "./domain/csv-parser";
export type { ParseStatementCsvError } from "./domain/csv-parser";
export type {
  NewStatementLine,
  ParsedStatementCsv,
  ParsedStatementLine,
  StatementImportSummary,
  StatementLine,
  StatementMatchKind,
} from "./domain/types";
export { importStatement } from "./application/import-statement";
export type { ImportStatementDeps, ImportStatementInput, ImportStatementResult } from "./application/import-statement";
export { createPaymentFromLine } from "./application/create-payment-from-line";
export type {
  CreatePaymentFromLineDeps,
  CreatePaymentFromLineError,
} from "./application/create-payment-from-line";
export {
  getStatementImportById,
  getStatementLineById,
  getStatementLinesByImport,
  listStatementImports,
  markStatementLineMatched,
  recordStatementImport,
} from "./infra/statement-repository";
export type { RecordStatementImportInput } from "./infra/statement-repository";
