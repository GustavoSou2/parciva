import { describe, expect, it } from "vitest";
import { isErr, isOk } from "@/shared/result";
import { validateExtractionOutput } from "./extraction-schema";

const VALID_OUTPUT = {
  is_payment_receipt: true,
  method: "pix",
  amount_cents: 15000,
  paid_at: "2026-08-12T14:30:00Z",
  transaction_ref: "E00000000202608121430ABCDEF12345",
  payer_name: "Fulano de Tal",
  payer_document_masked: "***.123.456-**",
  payee_name: "Empresa LTDA",
  payee_document_masked: "12.345.***/****-01",
  institution: "Nubank",
  confidence: 0.97,
  field_confidence: { amount_cents: 0.99, payer_name: 0.85 },
  anomalies: [],
};

describe("validateExtractionOutput", () => {
  it("aceita output válido completo", () => {
    const result = validateExtractionOutput(VALID_OUTPUT);
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.method).toBe("pix");
      expect(result.value.amount_cents).toBe(15000);
      expect(result.value.confidence).toBe(0.97);
    }
  });

  it("aceita is_payment_receipt: false (documento existe mas não é comprovante)", () => {
    const result = validateExtractionOutput({
      is_payment_receipt: false,
      confidence: 0.92,
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.is_payment_receipt).toBe(false);
      expect(result.value.method).toBe("unknown");
      expect(result.value.amount_cents).toBeNull();
      expect(result.value.field_confidence).toEqual({});
      expect(result.value.anomalies).toEqual([]);
    }
  });

  it("rejeita output sem campo obrigatório", () => {
    const withoutRequired: Record<string, unknown> = { ...VALID_OUTPUT };
    delete withoutRequired.is_payment_receipt;
    const result = validateExtractionOutput(withoutRequired);
    expect(isErr(result)).toBe(true);
  });

  it("rejeita amount_cents negativo", () => {
    const result = validateExtractionOutput({ ...VALID_OUTPUT, amount_cents: -100 });
    expect(isErr(result)).toBe(true);
  });

  it("rejeita confidence fora de 0–1", () => {
    expect(isErr(validateExtractionOutput({ ...VALID_OUTPUT, confidence: 1.5 }))).toBe(true);
    expect(isErr(validateExtractionOutput({ ...VALID_OUTPUT, confidence: -0.1 }))).toBe(true);
  });

  it("rejeita campo extra não declarado", () => {
    const result = validateExtractionOutput({ ...VALID_OUTPUT, unexpected_field: "surpresa" });
    expect(isErr(result)).toBe(true);
  });
});
