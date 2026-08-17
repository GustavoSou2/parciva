// porta pública do módulo — só o que está aqui pode ser importado de fora.
export { ingestReceipt } from "./application/ingest-receipt";
export type { IngestDeps, IngestError } from "./application/ingest-receipt";
export type { RawReceipt } from "./domain/types";
export { runVlmExtraction } from "./infra/anthropic-vlm";
export { extractTextFromImage } from "./infra/tesseract-ocr";
