import { describe, expect, it } from "vitest";
import { hashToken } from "./token";
import { generateRecoveryCodes, normalizeRecoveryCode, RECOVERY_CODE_COUNT } from "./recovery-codes";

describe("generateRecoveryCodes", () => {
  it("gera a quantidade padrão de códigos", () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(RECOVERY_CODE_COUNT);
  });

  it("todos os códigos gerados são únicos entre si", () => {
    const codes = generateRecoveryCodes(50);
    const unique = new Set(codes.map((c) => c.code));
    expect(unique.size).toBe(50);
  });

  it("cada código tem o formato XXXX-XXXX", () => {
    const codes = generateRecoveryCodes(20);
    for (const { code } of codes) {
      expect(code).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/);
    }
  });

  it("codeHash é o hash SHA-256 do código normalizado, nunca o código em claro", () => {
    const [first] = generateRecoveryCodes(1);
    expect(first!.codeHash).toBe(hashToken(normalizeRecoveryCode(first!.code)));
    expect(first!.codeHash).not.toContain(first!.code);
  });
});

describe("normalizeRecoveryCode", () => {
  it("remove hífen e sobe pra caixa alta", () => {
    expect(normalizeRecoveryCode("abcd-2345")).toBe("ABCD2345");
  });

  it("aceita o código sem hífen também", () => {
    expect(normalizeRecoveryCode("ABCD2345")).toBe("ABCD2345");
  });

  it("ignora espaço nas bordas", () => {
    expect(normalizeRecoveryCode("  ABCD-2345  ")).toBe("ABCD2345");
  });
});
