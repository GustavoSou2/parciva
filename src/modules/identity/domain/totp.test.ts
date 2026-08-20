import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  base32Decode,
  base32Encode,
  buildOtpauthUri,
  computeTotpCode,
  generateTotpCode,
  generateTotpSecret,
  verifyTotpCode,
} from "./totp";

describe("base32Encode/base32Decode", () => {
  it("roundtrip preserva os bytes originais", () => {
    const original = generateTotpSecret();
    expect(base32Decode(base32Encode(original))).toEqual(original);
  });

  it("propriedade: roundtrip preserva qualquer buffer aleatório", () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 1, maxLength: 64 }), (bytes) => {
        const buffer = Buffer.from(bytes);
        expect(base32Decode(base32Encode(buffer))).toEqual(buffer);
      }),
    );
  });
});

describe("computeTotpCode — vetor de teste RFC 4226 Apêndice D (HMAC-SHA1, 6 dígitos)", () => {
  // Segredo canônico da RFC: ASCII "12345678901234567890" (20 bytes).
  const secret = Buffer.from("12345678901234567890", "ascii");
  const expected = [
    "755224",
    "287082",
    "359152",
    "969429",
    "338314",
    "254676",
    "287922",
    "162583",
    "399871",
    "520489",
  ];

  it.each(expected.map((code, counter) => [counter, code]))("contador %i → %s", (counter, code) => {
    expect(computeTotpCode(secret, BigInt(counter))).toBe(code);
  });
});

describe("verifyTotpCode", () => {
  it("código gerado pro instante atual sempre valida nesse mesmo instante", () => {
    const secret = generateTotpSecret();
    const at = new Date("2026-08-19T12:00:00Z");
    const code = generateTotpCode(secret, at);
    expect(verifyTotpCode(secret, code, at)).toBe(true);
  });

  it("código dentro da janela de tolerância (±30s) ainda valida", () => {
    const secret = generateTotpSecret();
    const at = new Date("2026-08-19T12:00:00Z");
    const code = generateTotpCode(secret, at);
    const thirtySecondsLater = new Date(at.getTime() + 30_000);
    expect(verifyTotpCode(secret, code, thirtySecondsLater, { windowSteps: 1 })).toBe(true);
  });

  it("código muito fora da janela nunca valida", () => {
    const secret = generateTotpSecret();
    const at = new Date("2026-08-19T12:00:00Z");
    const code = generateTotpCode(secret, at);
    const muchLater = new Date(at.getTime() + 10 * 60_000);
    expect(verifyTotpCode(secret, code, muchLater, { windowSteps: 1 })).toBe(false);
  });

  it("código com formato inválido (não 6 dígitos) nunca valida", () => {
    const secret = generateTotpSecret();
    expect(verifyTotpCode(secret, "12345", new Date())).toBe(false);
    expect(verifyTotpCode(secret, "abcdef", new Date())).toBe(false);
    expect(verifyTotpCode(secret, "1234567", new Date())).toBe(false);
  });

  it("segredo diferente nunca valida o código de outro segredo", () => {
    const secretA = generateTotpSecret();
    const secretB = generateTotpSecret();
    const at = new Date("2026-08-19T12:00:00Z");
    const codeA = generateTotpCode(secretA, at);
    expect(verifyTotpCode(secretB, codeA, at)).toBe(false);
  });

  it("propriedade: pra qualquer segredo e instante, o código gerado pro mesmo instante sempre valida", () => {
    fc.assert(
      fc.property(
        fc.uint8Array({ minLength: 20, maxLength: 20 }),
        fc.integer({ min: 1_700_000_000_000, max: 2_000_000_000_000 }),
        (secretBytes, epochMs) => {
          const secret = Buffer.from(secretBytes);
          const at = new Date(epochMs);
          const code = generateTotpCode(secret, at);
          expect(verifyTotpCode(secret, code, at)).toBe(true);
        },
      ),
    );
  });

  it("propriedade: código de um instante muito distante (fora da janela) nunca valida", () => {
    fc.assert(
      fc.property(
        fc.uint8Array({ minLength: 20, maxLength: 20 }),
        fc.integer({ min: 1_700_000_000_000, max: 2_000_000_000_000 }),
        (secretBytes, epochMs) => {
          const secret = Buffer.from(secretBytes);
          const at = new Date(epochMs);
          const code = generateTotpCode(secret, at);
          const farAway = new Date(at.getTime() + 60 * 60_000); // 1h depois — bem além de ±30s
          expect(verifyTotpCode(secret, code, farAway, { windowSteps: 1 })).toBe(false);
        },
      ),
    );
  });
});

describe("buildOtpauthUri", () => {
  it("produz uma URI otpauth:// com o segredo em base32 e o e-mail no label", () => {
    const secret = generateTotpSecret();
    const uri = buildOtpauthUri(secret, "dono@empresa.com");
    expect(uri).toMatch(/^otpauth:\/\/totp\//);
    expect(uri).toContain(encodeURIComponent("Parciva:dono@empresa.com"));
    expect(uri).toContain(`secret=${base32Encode(secret)}`);
  });
});
