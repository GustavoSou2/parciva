import { describe, expect, it } from "vitest";
import {
  deriveCsrfToken,
  generateSessionToken,
  hashSessionToken,
  sessionExpiresAt,
  verifyCsrfToken,
} from "./session";

describe("generateSessionToken / hashSessionToken", () => {
  it("gera tokens diferentes a cada chamada", () => {
    expect(generateSessionToken()).not.toBe(generateSessionToken());
  });

  it("hash é determinístico para o mesmo token", () => {
    const token = generateSessionToken();
    expect(hashSessionToken(token)).toBe(hashSessionToken(token));
  });

  it("hash de tokens diferentes é diferente", () => {
    expect(hashSessionToken("a")).not.toBe(hashSessionToken("b"));
  });
});

describe("sessionExpiresAt", () => {
  it("expira 7 dias à frente da referência", () => {
    const from = new Date("2026-01-01T00:00:00Z");
    const expires = sessionExpiresAt(from);
    expect(expires.toISOString()).toBe("2026-01-08T00:00:00.000Z");
  });
});

describe("CSRF token", () => {
  it("verifyCsrfToken aceita o token derivado do mesmo hash+secret", () => {
    const hash = hashSessionToken(generateSessionToken());
    const csrf = deriveCsrfToken(hash, "segredo");
    expect(verifyCsrfToken(csrf, hash, "segredo")).toBe(true);
  });

  it("rejeita token de outra sessão", () => {
    const hashA = hashSessionToken("a");
    const hashB = hashSessionToken("b");
    const csrfA = deriveCsrfToken(hashA, "segredo");
    expect(verifyCsrfToken(csrfA, hashB, "segredo")).toBe(false);
  });

  it("rejeita com secret errado", () => {
    const hash = hashSessionToken(generateSessionToken());
    const csrf = deriveCsrfToken(hash, "segredo-certo");
    expect(verifyCsrfToken(csrf, hash, "segredo-errado")).toBe(false);
  });

  it("rejeita token malformado sem lançar", () => {
    const hash = hashSessionToken(generateSessionToken());
    expect(verifyCsrfToken("não-é-hex-válido!!", hash, "segredo")).toBe(false);
  });
});
