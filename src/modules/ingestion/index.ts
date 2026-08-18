// porta pública do módulo — só o que está aqui pode ser importado de fora.
export { ingestReceipt, decideReceiptStatus } from "./application/ingest-receipt";
export type { IngestDeps, IngestError } from "./application/ingest-receipt";
export type {
  RawReceipt,
  ExtractionOutput,
  ExtractionTier,
  ReceiptSource,
  FieldConfidence,
} from "./domain/types";
export { extractFromText } from "./domain/deterministic-extractor";
export { computeHash } from "./domain/normalizer";
export { runVlmExtraction } from "./infra/anthropic-vlm";
export { extractTextFromImage } from "./infra/tesseract-ocr";
export {
  receiptExistsByHash,
  createReceipt,
  updateReceiptStatus,
  saveExtraction,
} from "./infra/receipt-repository";
export type { ReceiptStatus, NewReceipt, NewReceiptExtraction } from "./infra/receipt-repository";
