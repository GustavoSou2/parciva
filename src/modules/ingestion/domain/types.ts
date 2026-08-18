/**
 * Tipos puros do domínio de ingestão — spec §7 (pipeline de extração).
 * Sem I/O: nenhuma função aqui lê banco, storage, fila ou rede.
 */

import type { Money } from "@/shared/money";

/** Canal por onde o comprovante chegou — spec §5.3 (receipts.source). */
export type ReceiptSource = "whatsapp" | "upload" | "email" | "api";

/** Estágio da cascata de custo que produziu a extração — spec §7.1. */
export type ExtractionTier = "cache" | "deterministic" | "ocr" | "vlm_cheap" | "vlm_premium" | "human";

/** Forma de pagamento identificada no comprovante — spec §7.4 (`method`). */
export type ExtractionMethod =
  "pix" | "ted" | "doc" | "boleto" | "card" | "cash" | "other" | "unknown";

/** Confiança por campo extraído (0–1) — spec §7.4 (`field_confidence`). */
export type FieldConfidence = Record<string, number>;

/**
 * Contrato de saída da extração — espelha o JSON Schema da spec §7.4.
 * Só os campos que a spec declara `["tipo","null"]` carregam `| null`
 * aqui. `method`, `field_confidence` e `anomalies` não são nullable na
 * spec (são apenas opcionais na saída crua); `validateExtractionOutput`
 * (extraction-schema.ts) normaliza ausência para "unknown" / `{}` / `[]`
 * respectivamente, então este tipo nunca representa o campo ausente.
 */
export interface ExtractionOutput {
  readonly is_payment_receipt: boolean;
  readonly method: ExtractionMethod;
  readonly amount_cents: Money | null;
  readonly paid_at: string | null;
  readonly transaction_ref: string | null;
  readonly payer_name: string | null;
  readonly payer_document_masked: string | null;
  readonly payee_name: string | null;
  readonly payee_document_masked: string | null;
  readonly institution: string | null;
  readonly confidence: number;
  readonly field_confidence: FieldConfidence;
  readonly anomalies: readonly string[];
}

/** O que chega antes de qualquer processamento — spec §5.3 (receipts). */
export interface RawReceipt {
  readonly buffer: Buffer;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly source: ReceiptSource;
  readonly receivedAt: Date;
  /** E.164, sem prefixo `whatsapp:` — quem mandou, quando `source === "whatsapp"`. Usado na identificação de pagador (spec §6.3) — Marco 4. */
  readonly fromPhone?: string;
}
