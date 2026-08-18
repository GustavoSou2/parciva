import { describe, expect, it } from "vitest";
import { identifyPayer } from "./identification";
import type { Payer } from "./types";

function payer(overrides: Partial<Payer> & { id: string }): Payer {
  return {
    name: "Fulano de Tal",
    documentType: "cpf",
    documentMasked: null,
    phoneE164: null,
    email: null,
    status: "active",
    ...overrides,
  };
}

describe("identifyPayer — §6.3", () => {
  it("prioriza telefone sobre qualquer outro sinal", () => {
    const byPhone = payer({ id: "p1", phoneE164: "+5511999990000", name: "Telefone Certo" });
    const byName = payer({ id: "p2", name: "Fulano de Tal" });
    const result = identifyPayer([byPhone, byName], {
      fromPhone: "+5511999990000",
      name: "Fulano de Tal",
    });
    expect(result).toEqual({ tier: "phone", payerId: "p1" });
  });

  it("cai para documento mascarado quando não há telefone batendo", () => {
    const match = payer({ id: "p1", documentMasked: "***.123.456-**" });
    const result = identifyPayer([match], {
      fromPhone: "+5511000000000",
      documentMasked: "***.123.456-**",
    });
    expect(result).toEqual({ tier: "document", payerId: "p1" });
  });

  it("compara documento mascarado como string exata, nunca hash do valor completo", () => {
    const match = payer({ id: "p1", documentMasked: "***.123.456-**" });
    const result = identifyPayer([match], { documentMasked: "***.999.999-**" });
    expect(result.tier).toBeNull();
  });

  it("cai para nome fuzzy quando não há telefone nem documento", () => {
    const match = payer({ id: "p1", name: "Maria da Silva Santos" });
    const result = identifyPayer([match], { name: "MARIA DA SILVA SANTOS" });
    expect(result).toEqual({ tier: "name", payerId: "p1" });
  });

  it("nome fuzzy ignora acento, caixa e sufixo societário", () => {
    const match = payer({ id: "p1", name: "Comércio e Cia LTDA" });
    const result = identifyPayer([match], { name: "comercio e cia" });
    expect(result.tier).toBe("name");
  });

  it("nome muito diferente não gera match — devolve candidatos", () => {
    const p1 = payer({ id: "p1", name: "João Pedro Almeida" });
    const result = identifyPayer([p1], { name: "Zeca Roberto Ferreira" });
    expect(result.tier).toBeNull();
    if (result.tier === null) {
      expect(result.candidates.length).toBeGreaterThan(0);
    }
  });

  it("sem nenhum dado de entrada, devolve tier null e candidatos vazios", () => {
    const p1 = payer({ id: "p1" });
    const result = identifyPayer([p1], {});
    expect(result).toEqual({ tier: null, candidates: [] });
  });

  it("lista vazia de pagadores nunca lança, devolve tier null", () => {
    const result = identifyPayer([], { fromPhone: "+5511999990000", name: "Alguém" });
    expect(result.tier).toBeNull();
  });
});
