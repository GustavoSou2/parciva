import { randomBytes } from "node:crypto";
import fc from "fast-check";
import { beforeEach, describe, expect, it } from "vitest";
import { CryptoError, decryptSecret, encryptSecret } from "./crypto";

beforeEach(() => {
  process.env.ENCRYPTION_KEY = randomBytes(32).toString("base64");
});

describe("encryptSecret/decryptSecret", () => {
  it("roundtrip: decifrar o que foi cifrado devolve o texto original", () => {
    const plaintext = "JBSWY3DPEHPK3PXP";
    expect(decryptSecret(encryptSecret(plaintext))).toBe(plaintext);
  });

  it("duas cifras do mesmo texto nunca produzem o mesmo ciphertext (IV aleatório)", () => {
    const a = encryptSecret("mesmo-segredo");
    const b = encryptSecret("mesmo-segredo");
    expect(a).not.toBe(b);
  });

  it("ciphertext adulterado falha ao decifrar (autenticado, não só cifrado)", () => {
    const stored = encryptSecret("segredo-totp");
    const [iv, tag, data] = stored.split(":");
    const tampered = `${iv}:${tag}:${data!.slice(0, -2)}AA`;
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it("sem ENCRYPTION_KEY configurada, lança CryptoError", () => {
    delete process.env.ENCRYPTION_KEY;
    expect(() => encryptSecret("x")).toThrow(CryptoError);
  });

  it("ENCRYPTION_KEY com tamanho errado lança CryptoError", () => {
    process.env.ENCRYPTION_KEY = Buffer.from("chave-curta-demais").toString("base64");
    expect(() => encryptSecret("x")).toThrow(CryptoError);
  });

  it("formato inválido de ciphertext lança CryptoError", () => {
    expect(() => decryptSecret("nao-tem-os-tres-pedacos")).toThrow(CryptoError);
  });

  it("propriedade: roundtrip preserva qualquer texto UTF-8 arbitrário", () => {
    fc.assert(
      fc.property(fc.string(), (plaintext) => {
        expect(decryptSecret(encryptSecret(plaintext))).toBe(plaintext);
      }),
    );
  });
});
