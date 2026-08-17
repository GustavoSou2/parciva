/**
 * Validação da saída de qualquer extrator (determinístico ou VLM) contra
 * o contrato da spec §7.4 — CLAUDE.md invariante 4: "a IA propõe, a regra
 * dispõe". Nenhuma saída de modelo vira `ExtractionOutput` sem passar por
 * `validateExtractionOutput`; rejeitar aqui é o que força o Tier 4 / fila
 * de revisão em vez de aceitar um formato ambíguo (§7.4, "não chutar").
 */

import { z } from "zod";
import type { Result } from "@/shared/result";
import { err, ok } from "@/shared/result";
import { money } from "@/shared/money";
import type { ExtractionOutput } from "./types";

/**
 * Espelho literal do JSON Schema da spec §7.4 — não deriva do schema Zod
 * abaixo de propósito: é o formato enviado a provedores de VLM como
 * saída estruturada (function calling / response schema), então precisa
 * casar exatamente com o texto da spec, não com o que for conveniente
 * para o Zod expressar.
 */
export const EXTRACTION_OUTPUT_SCHEMA = {
  type: "object",
  required: ["is_payment_receipt", "confidence"],
  additionalProperties: false,
  properties: {
    is_payment_receipt: { type: "boolean" },
    method: { enum: ["pix", "ted", "doc", "boleto", "card", "cash", "other", "unknown"] },
    amount_cents: { type: ["integer", "null"], minimum: 0 },
    paid_at: { type: ["string", "null"], format: "date-time" },
    transaction_ref: { type: ["string", "null"] },
    payer_name: { type: ["string", "null"] },
    payer_document_masked: { type: ["string", "null"] },
    payee_name: { type: ["string", "null"] },
    payee_document_masked: { type: ["string", "null"] },
    institution: { type: ["string", "null"] },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    field_confidence: { type: "object" },
    anomalies: { type: "array", items: { type: "string" } },
  },
} as const;

/**
 * Validador Zod equivalente ao schema acima. `.strict()` cobre
 * `additionalProperties: false`. `field_confidence` é tipado como
 * `Record<string, number>` (mais estrito que o `{type:"object"}` literal
 * da spec) porque é exatamente o que `FieldConfidence` exige — um valor
 * não numérico aqui é saída malformada, não um campo legítimo que o Zod
 * deveria aceitar frouxamente.
 */
const RawExtractionOutputSchema = z
  .object({
    is_payment_receipt: z.boolean(),
    method: z.enum(["pix", "ted", "doc", "boleto", "card", "cash", "other", "unknown"]).optional(),
    amount_cents: z.number().int().min(0).nullable().optional(),
    paid_at: z.string().datetime().nullable().optional(),
    transaction_ref: z.string().nullable().optional(),
    payer_name: z.string().nullable().optional(),
    payer_document_masked: z.string().nullable().optional(),
    payee_name: z.string().nullable().optional(),
    payee_document_masked: z.string().nullable().optional(),
    institution: z.string().nullable().optional(),
    confidence: z.number().min(0).max(1),
    field_confidence: z.record(z.string(), z.number()).optional(),
    anomalies: z.array(z.string()).optional(),
  })
  .strict();

/**
 * Valida saída crua (de VLM, cache ou extrator determinístico) e produz
 * um `ExtractionOutput` normalizado. Ausência de `method` / `field_confidence`
 * / `anomalies` normaliza para "unknown" / `{}` / `[]` — ver types.ts.
 */
export function validateExtractionOutput(raw: unknown): Result<ExtractionOutput, string> {
  const parsed = RawExtractionOutputSchema.safeParse(raw);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    return err(`Saída de extração inválida — ${detail}`);
  }

  const data = parsed.data;
  return ok({
    is_payment_receipt: data.is_payment_receipt,
    method: data.method ?? "unknown",
    amount_cents: data.amount_cents == null ? null : money(data.amount_cents),
    paid_at: data.paid_at ?? null,
    transaction_ref: data.transaction_ref ?? null,
    payer_name: data.payer_name ?? null,
    payer_document_masked: data.payer_document_masked ?? null,
    payee_name: data.payee_name ?? null,
    payee_document_masked: data.payee_document_masked ?? null,
    institution: data.institution ?? null,
    confidence: data.confidence,
    field_confidence: data.field_confidence ?? {},
    anomalies: data.anomalies ?? [],
  });
}
