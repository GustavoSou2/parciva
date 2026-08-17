import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  DocumentError,
  detectDocumentType,
  hashDocument,
  isValidCnpj,
  isValidCpf,
  isValidDocument,
  maskDocument,
  normalizeDocument,
} from "./document";

// Documentos abaixo foram gerados pelo mesmo algoritmo implementado em
// document.ts (mod 11, pesos padrão da Receita) — não são CPF/CNPJ reais.

const VALID_CPF = "52998224725";
const VALID_CPF_MASKED = "111.444.777-35";
const VALID_CPF_2 = "11144477735";

const VALID_CNPJ_NUMERIC = "11223344000186";
const VALID_CNPJ_ALPHANUMERIC = "12ABC34501DE35"; // 12 primeiras posições com letras
const VALID_CNPJ_ALPHANUMERIC_2 = "1234567A000104";

describe("normalizeDocument", () => {
  it("remove pontuação e força caixa alta", () => {
    expect(normalizeDocument("12.abc.345/6789-01")).toBe("12ABC345678901");
    expect(normalizeDocument("529.982.247-25")).toBe("52998224725");
  });

  it("mesmo documento em caixas diferentes normaliza igual (C-40)", () => {
    const a = normalizeDocument("12.abc.345/6789-01");
    const b = normalizeDocument("12.ABC.345/6789-01");
    expect(a).toBe(b);
  });
});

describe("isValidCpf", () => {
  it("aceita CPF válido", () => {
    expect(isValidCpf(VALID_CPF)).toBe(true);
    expect(isValidCpf(VALID_CPF_2)).toBe(true);
  });

  it("aceita CPF válido com máscara", () => {
    expect(isValidCpf("529.982.247-25")).toBe(true);
  });

  it("rejeita dígito verificador errado", () => {
    expect(isValidCpf("52998224700")).toBe(false);
  });

  it("rejeita sequência de dígito repetido, mesmo que passasse no checksum", () => {
    expect(isValidCpf("00000000000")).toBe(false);
    expect(isValidCpf("11111111111")).toBe(false);
  });

  it("rejeita tamanho incorreto", () => {
    expect(isValidCpf("123")).toBe(false);
    expect(isValidCpf("1234567890123")).toBe(false);
  });

  it("rejeita CNPJ passado como CPF", () => {
    expect(isValidCpf(VALID_CNPJ_NUMERIC)).toBe(false);
  });
});

describe("isValidCnpj — numérico", () => {
  it("aceita CNPJ numérico válido", () => {
    expect(isValidCnpj(VALID_CNPJ_NUMERIC)).toBe(true);
  });

  it("aceita com máscara", () => {
    expect(isValidCnpj("11.223.344/0001-86")).toBe(true);
  });

  it("rejeita dígito verificador errado", () => {
    expect(isValidCnpj("11223344000100")).toBe(false);
  });
});

describe("isValidCnpj — alfanumérico (IN RFB 2.229/2024)", () => {
  it("aceita CNPJ com letras nas 12 primeiras posições", () => {
    expect(isValidCnpj(VALID_CNPJ_ALPHANUMERIC)).toBe(true);
    expect(isValidCnpj(VALID_CNPJ_ALPHANUMERIC_2)).toBe(true);
  });

  it("aceita com máscara e letra minúscula (normaliza antes de validar)", () => {
    expect(isValidCnpj("12.abc.345/01de-35")).toBe(true);
  });

  it("rejeita letra nos dois últimos dígitos verificadores", () => {
    // DV tem que ser sempre numérico, mesmo em CNPJ alfanumérico
    const base = VALID_CNPJ_ALPHANUMERIC.slice(0, 12);
    expect(isValidCnpj(`${base}3A`)).toBe(false);
  });

  it("não é 'corrigido' silenciosamente — muda a letra, muda o resultado (C-39)", () => {
    // Se alguém (ou um VLM) troca uma letra por dígito parecido, o CNPJ
    // deixa de validar em vez de ser aceito por coincidência.
    const corrompido = VALID_CNPJ_ALPHANUMERIC.replace("A", "4"); // A -> 4 (não é a heurística usual, mas já basta mudar o valor)
    expect(isValidCnpj(corrompido)).toBe(false);
  });

  it("rejeita tamanho incorreto", () => {
    expect(isValidCnpj("12ABC34501DE")).toBe(false); // 12 chars, falta DV
  });
});

describe("isValidDocument", () => {
  it("aceita CPF ou CNPJ válido", () => {
    expect(isValidDocument(VALID_CPF)).toBe(true);
    expect(isValidDocument(VALID_CNPJ_NUMERIC)).toBe(true);
    expect(isValidDocument(VALID_CNPJ_ALPHANUMERIC)).toBe(true);
  });

  it("rejeita lixo", () => {
    expect(isValidDocument("não é documento")).toBe(false);
  });
});

describe("detectDocumentType", () => {
  it("identifica CPF e CNPJ pelo tamanho e validade", () => {
    expect(detectDocumentType(VALID_CPF)).toBe("cpf");
    expect(detectDocumentType(VALID_CNPJ_NUMERIC)).toBe("cnpj");
    expect(detectDocumentType(VALID_CNPJ_ALPHANUMERIC)).toBe("cnpj");
  });

  it("retorna null para documento inválido", () => {
    expect(detectDocumentType("00000000000")).toBeNull();
  });
});

describe("maskDocument", () => {
  it("formata CPF", () => {
    expect(maskDocument(VALID_CPF_2, "cpf")).toBe(VALID_CPF_MASKED);
  });

  it("formata CNPJ numérico", () => {
    expect(maskDocument(VALID_CNPJ_NUMERIC, "cnpj")).toBe("11.223.344/0001-86");
  });

  it("formata CNPJ alfanumérico preservando as letras", () => {
    expect(maskDocument(VALID_CNPJ_ALPHANUMERIC, "cnpj")).toBe("12.ABC.345/01DE-35");
  });

  it("lança DocumentError com tamanho incompatível com o tipo", () => {
    expect(() => maskDocument(VALID_CPF, "cnpj")).toThrow(DocumentError);
  });
});

describe("hashDocument", () => {
  const pepper = "pepper-de-teste-nao-usar-em-producao";

  it("é determinístico para o mesmo documento e pepper", () => {
    const h1 = hashDocument(VALID_CPF, pepper);
    const h2 = hashDocument(VALID_CPF, pepper);
    expect(h1).toBe(h2);
  });

  it("produz o MESMO hash independente de máscara ou caixa (C-40)", () => {
    const h1 = hashDocument("529.982.247-25", pepper);
    const h2 = hashDocument("52998224725", pepper);
    expect(h1).toBe(h2);
  });

  it("CNPJ alfanumérico em caixa baixa gera o mesmo hash que em caixa alta", () => {
    const h1 = hashDocument(VALID_CNPJ_ALPHANUMERIC.toLowerCase(), pepper);
    const h2 = hashDocument(VALID_CNPJ_ALPHANUMERIC, pepper);
    expect(h1).toBe(h2);
  });

  it("pepper diferente produz hash diferente", () => {
    const h1 = hashDocument(VALID_CPF, pepper);
    const h2 = hashDocument(VALID_CPF, "outro-pepper");
    expect(h1).not.toBe(h2);
  });

  it("lança se pepper estiver vazio — nunca gerar hash sem pepper", () => {
    expect(() => hashDocument(VALID_CPF, "")).toThrow(DocumentError);
  });
});

describe("propriedade: normalizeDocument é idempotente", () => {
  it("normalizar duas vezes é igual a normalizar uma vez", () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const once = normalizeDocument(s);
        const twice = normalizeDocument(once);
        expect(twice).toBe(once);
      }),
    );
  });
});
