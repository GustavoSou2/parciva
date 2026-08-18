import { describe, expect, it } from "vitest";
import { isErr, isOk } from "@/shared/result";
import { validateNewPayer } from "./validate-payer";

describe("validateNewPayer", () => {
  it("rejeita nome vazio", () => {
    const result = validateNewPayer({ name: "   " });
    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error).toBe("empty_name");
  });

  it("aceita sem documento (identificação por telefone/nome vem depois, spec §6.3)", () => {
    const result = validateNewPayer({ name: "Maria Silva", phoneE164: "+5511999990000" });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.documentType).toBe("none");
      expect(result.value.document).toBeNull();
      expect(result.value.phoneE164).toBe("+5511999990000");
    }
  });

  it("normaliza e mascara CPF válido", () => {
    const result = validateNewPayer({ name: "João", document: "111.444.777-35" });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.documentType).toBe("cpf");
      expect(result.value.document).toBe("11144477735");
      expect(result.value.documentMasked).toBe("111.444.777-35");
    }
  });

  it("rejeita CPF/CNPJ inválido", () => {
    const result = validateNewPayer({ name: "João", document: "000.000.000-00" });
    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error).toBe("invalid_document");
  });

  it("trata string vazia de email/telefone como ausência", () => {
    const result = validateNewPayer({ name: "Empresa X", email: "" });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value.email).toBeNull();
  });
});
