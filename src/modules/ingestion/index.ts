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
export { computeHash, computePerceptualHash, PHASH_NEAR_DUPLICATE_MAX_DISTANCE } from "./domain/normalizer";
export { runVlmExtraction } from "./infra/anthropic-vlm";
export { extractTextFromImage } from "./infra/tesseract-ocr";
export {
  receiptExistsByHash,
  findNearDuplicateByPerceptualHash,
  createReceipt,
  updateReceiptStatus,
  saveExtraction,
  getReceiptWithExtraction,
} from "./infra/receipt-repository";
export type {
  ReceiptStatus,
  NewReceipt,
  NewReceiptExtraction,
  ReceiptWithExtraction,
} from "./infra/receipt-repository";
