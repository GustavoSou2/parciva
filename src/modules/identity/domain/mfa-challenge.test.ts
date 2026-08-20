import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createMfaChallenge, MFA_CHALLENGE_TTL_MS, verifyMfaChallenge } from "./mfa-challenge";

const SECRET = "test-session-secret";

describe("createMfaChallenge/verifyMfaChallenge", () => {
  it("challenge válido devolve o userId de volta", () => {
    const now = new Date("2026-08-19T12:00:00Z");
    const token = createMfaChallenge("user-123", SECRET, now);
    expect(verifyMfaChallenge(token, SECRET, now)).toBe("user-123");
  });

  it("dentro do TTL ainda é válido", () => {
    const now = new Date("2026-08-19T12:00:00Z");
    const token = createMfaChallenge("user-123", SECRET, now);
    const almostExpired = new Date(now.getTime() + MFA_CHALLENGE_TTL_MS - 1000);
    expect(verifyMfaChallenge(token, SECRET, almostExpired)).toBe("user-123");
  });

  it("depois do TTL expira", () => {
    const now = new Date("2026-08-19T12:00:00Z");
    const token = createMfaChallenge("user-123", SECRET, now);
    const afterExpiry = new Date(now.getTime() + MFA_CHALLENGE_TTL_MS + 1000);
    expect(verifyMfaChallenge(token, SECRET, afterExpiry)).toBeNull();
  });

  it("segredo errado invalida o token", () => {
    const now = new Date("2026-08-19T12:00:00Z");
    const token = createMfaChallenge("user-123", SECRET, now);
    expect(verifyMfaChallenge(token, "outro-segredo", now)).toBeNull();
  });

  it("token adulterado invalida", () => {
    const now = new Date("2026-08-19T12:00:00Z");
    const token = createMfaChallenge("user-123", SECRET, now);
    expect(verifyMfaChallenge(token + "x", SECRET, now)).toBeNull();
  });

  it("lixo qualquer nunca lança, só devolve null", () => {
    expect(verifyMfaChallenge("", SECRET)).toBeNull();
    expect(verifyMfaChallenge("sem-ponto", SECRET)).toBeNull();
    expect(verifyMfaChallenge("###.###", SECRET)).toBeNull();
  });

  it("propriedade: qualquer challenge recém-criado sempre valida com o mesmo segredo e instante", () => {
    fc.assert(
      fc.property(fc.uuid(), fc.string({ minLength: 1 }), (userId, secret) => {
        const now = new Date();
        const token = createMfaChallenge(userId, secret, now);
        expect(verifyMfaChallenge(token, secret, now)).toBe(userId);
      }),
    );
  });
});
