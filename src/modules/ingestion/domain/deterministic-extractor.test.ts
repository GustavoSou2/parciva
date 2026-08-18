import { describe, expect, it } from "vitest";
import { extractFromText } from "./deterministic-extractor";

const VALID_E2E_ID = "E18236120202608121430ABC123DEF45";

describe("extractFromText — E2E ID", () => {
  it("extrai E2E ID válido de 32 chars", () => {
    const result = extractFromText(`Comprovante PIX. ID da transação: ${VALID_E2E_ID}.`);
    expect(result.transaction_ref).toBe(VALID_E2E_ID);
  });

  it("não extrai E2E ID com tamanho errado", () => {
    const truncated = VALID_E2E_ID.slice(0, -1);
    const result = extractFromText(`ID da transação: ${truncated}.`);
    expect(result.transaction_ref).toBeUndefined();
  });
});

describe("extractFromText — valor", () => {
  it("converte valor com ponto de milhar e vírgula decimal para centavos", () => {
    const result = extractFromText("Valor pago: R$ 1.234,56");
    expect(result.amount_cents).toBe(123456);
  });

  it("não extrai valor ambíguo (sem R$ e sem centavos explícitos)", () => {
    const result = extractFromText("Referência interna do lote: 1.500");
    expect(result.amount_cents).toBeUndefined();
  });
});

describe("extractFromText — data", () => {
  it("não extrai paid_at quando só a data aparece, sem hora (nunca chuta meia-noite)", () => {
    const result = extractFromText("Pagamento realizado em 12/08/2026.");
    expect(result.paid_at).toBeUndefined();
  });

  it("extrai data e hora com offset -03:00 (horário local, nunca Z)", () => {
    const result = extractFromText("Pagamento realizado em 12/08/2026 às 14:30.");
    expect(result.paid_at).toBe("2026-08-12T14:30:00-03:00");
  });
});

describe("extractFromText — instituição", () => {
  it("identifica instituição conhecida por ISPB", () => {
    const result = extractFromText(`Comprovante PIX. ID da transação: ${VALID_E2E_ID}.`);
    expect(result.institution).toBe("Nubank");
  });
});

describe("extractFromText — sem campos reconhecíveis", () => {
  it("retorna objeto vazio para texto sem nada extraível", () => {
    const result = extractFromText("Olá! Tudo bem com você hoje?");
    expect(result).toEqual({});
  });
});
