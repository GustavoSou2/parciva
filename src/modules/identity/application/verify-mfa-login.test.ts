import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { isErr } from "@/shared/result";
import { encryptSecret } from "@/shared/crypto";
import { createMfaChallenge } from "../domain/mfa-challenge";
import { generateTotpCode, generateTotpSecret } from "../domain/totp";
import { generateRecoveryCodes, normalizeRecoveryCode } from "../domain/recovery-codes";
import { hashToken } from "../domain/token";
import { verifyMfaLogin, type VerifyMfaLoginDeps } from "./verify-mfa-login";

const SECRET_KEY = "test-session-secret";
const FUTURE = new Date(Date.now() + 30 * 60 * 1000);

beforeEach(() => {
  process.env.ENCRYPTION_KEY = randomBytes(32).toString("base64");
});

function buildDeps(overrides: Partial<VerifyMfaLoginDeps> = {}): VerifyMfaLoginDeps {
  return {
    mfaChallengeSecret: SECRET_KEY,
    getMfaState: vi.fn().mockResolvedValue(null),
    consumeRecoveryCode: vi.fn().mockResolvedValue(false),
    createSession: vi.fn().mockResolvedValue({ rawToken: "raw-session-token", expiresAt: FUTURE }),
    touchLastLogin: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("verifyMfaLogin", () => {
  it("challenge inválido/adulterado -> Err invalid_or_expired_challenge", async () => {
    const deps = buildDeps();
    const result = await verifyMfaLogin({ challengeToken: "lixo", code: "123456" }, deps);
    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error).toBe("invalid_or_expired_challenge");
  });

  it("challenge válido mas usuário sem MFA ativo -> Err invalid_or_expired_challenge", async () => {
    const challengeToken = createMfaChallenge("user-1", SECRET_KEY);
    const deps = buildDeps({ getMfaState: vi.fn().mockResolvedValue({ mfaEnabled: false, mfaSecretRef: null }) });
    const result = await verifyMfaLogin({ challengeToken, code: "123456" }, deps);
    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error).toBe("invalid_or_expired_challenge");
  });

  it("código TOTP certo -> cria sessão", async () => {
    const secret = generateTotpSecret();
    const challengeToken = createMfaChallenge("user-1", SECRET_KEY);
    const createSession = vi.fn().mockResolvedValue({ rawToken: "raw-session-token", expiresAt: FUTURE });
    const deps = buildDeps({
      getMfaState: vi
        .fn()
        .mockResolvedValue({ mfaEnabled: true, mfaSecretRef: encryptSecret(secret.toString("base64")) }),
      createSession,
    });
    const result = await verifyMfaLogin({ challengeToken, code: generateTotpCode(secret) }, deps);
    expect(isErr(result)).toBe(false);
    if (!isErr(result)) expect(result.value.sessionToken).toBe("raw-session-token");
    expect(createSession).toHaveBeenCalledWith("user-1");
  });

  it("código TOTP errado e sem código de recuperação válido -> Err invalid_code", async () => {
    const secret = generateTotpSecret();
    const challengeToken = createMfaChallenge("user-1", SECRET_KEY);
    const deps = buildDeps({
      getMfaState: vi
        .fn()
        .mockResolvedValue({ mfaEnabled: true, mfaSecretRef: encryptSecret(secret.toString("base64")) }),
      consumeRecoveryCode: vi.fn().mockResolvedValue(false),
    });
    const result = await verifyMfaLogin({ challengeToken, code: "000000" }, deps);
    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error).toBe("invalid_code");
  });

  it("código de recuperação válido (TOTP errado) -> consome o código e cria sessão", async () => {
    const secret = generateTotpSecret();
    const [recovery] = generateRecoveryCodes(1);
    const challengeToken = createMfaChallenge("user-1", SECRET_KEY);
    const consumeRecoveryCode = vi.fn().mockResolvedValue(true);
    const deps = buildDeps({
      getMfaState: vi
        .fn()
        .mockResolvedValue({ mfaEnabled: true, mfaSecretRef: encryptSecret(secret.toString("base64")) }),
      consumeRecoveryCode,
    });
    const result = await verifyMfaLogin({ challengeToken, code: recovery!.code }, deps);
    expect(isErr(result)).toBe(false);
    expect(consumeRecoveryCode).toHaveBeenCalledWith("user-1", hashToken(normalizeRecoveryCode(recovery!.code)));
  });

  it("nunca tenta código de recuperação se o TOTP já bateu (evita gastar o código à toa)", async () => {
    const secret = generateTotpSecret();
    const challengeToken = createMfaChallenge("user-1", SECRET_KEY);
    const consumeRecoveryCode = vi.fn().mockResolvedValue(false);
    const deps = buildDeps({
      getMfaState: vi
        .fn()
        .mockResolvedValue({ mfaEnabled: true, mfaSecretRef: encryptSecret(secret.toString("base64")) }),
      consumeRecoveryCode,
    });
    await verifyMfaLogin({ challengeToken, code: generateTotpCode(secret) }, deps);
    expect(consumeRecoveryCode).not.toHaveBeenCalled();
  });
});
