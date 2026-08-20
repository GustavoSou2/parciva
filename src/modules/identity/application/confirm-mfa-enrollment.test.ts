import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { isErr } from "@/shared/result";
import { encryptSecret } from "@/shared/crypto";
import { generateTotpCode, generateTotpSecret } from "../domain/totp";
import { confirmMfaEnrollment, type ConfirmMfaEnrollmentDeps } from "./confirm-mfa-enrollment";

beforeEach(() => {
  process.env.ENCRYPTION_KEY = randomBytes(32).toString("base64");
});

function buildPendingState(secret: Buffer) {
  return { mfaEnabled: false, mfaSecretRef: encryptSecret(secret.toString("base64")) };
}

describe("confirmMfaEnrollment", () => {
  it("sem enrollment pendente (mfaSecretRef nulo) -> Err no_pending_enrollment", async () => {
    const enableMfa = vi.fn();
    const deps: ConfirmMfaEnrollmentDeps = {
      getMfaState: vi.fn().mockResolvedValue({ mfaEnabled: false, mfaSecretRef: null }),
      enableMfa,
      saveRecoveryCodes: vi.fn(),
    };
    const result = await confirmMfaEnrollment("user-1", "123456", deps);
    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error).toBe("no_pending_enrollment");
    expect(enableMfa).not.toHaveBeenCalled();
  });

  it("já ativado (mfaEnabled true) -> Err no_pending_enrollment, não deixa reconfirmar", async () => {
    const secret = generateTotpSecret();
    const deps: ConfirmMfaEnrollmentDeps = {
      getMfaState: vi.fn().mockResolvedValue({ mfaEnabled: true, mfaSecretRef: encryptSecret(secret.toString("base64")) }),
      enableMfa: vi.fn(),
      saveRecoveryCodes: vi.fn(),
    };
    const result = await confirmMfaEnrollment("user-1", generateTotpCode(secret), deps);
    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error).toBe("no_pending_enrollment");
  });

  it("código errado -> Err invalid_code, nada é ativado", async () => {
    const secret = generateTotpSecret();
    const enableMfa = vi.fn();
    const saveRecoveryCodes = vi.fn();
    const deps: ConfirmMfaEnrollmentDeps = {
      getMfaState: vi.fn().mockResolvedValue(buildPendingState(secret)),
      enableMfa,
      saveRecoveryCodes,
    };
    const result = await confirmMfaEnrollment("user-1", "000000", deps);
    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error).toBe("invalid_code");
    expect(enableMfa).not.toHaveBeenCalled();
    expect(saveRecoveryCodes).not.toHaveBeenCalled();
  });

  it("código certo -> ativa MFA, grava 10 hashes, devolve 10 códigos em claro únicos", async () => {
    const secret = generateTotpSecret();
    const enableMfa = vi.fn<(userId: string) => Promise<void>>().mockResolvedValue(undefined);
    const saveRecoveryCodes = vi
      .fn<(userId: string, codeHashes: readonly string[]) => Promise<void>>()
      .mockResolvedValue(undefined);
    const deps: ConfirmMfaEnrollmentDeps = {
      getMfaState: vi.fn().mockResolvedValue(buildPendingState(secret)),
      enableMfa,
      saveRecoveryCodes,
    };
    const result = await confirmMfaEnrollment("user-1", generateTotpCode(secret), deps);
    expect(isErr(result)).toBe(false);
    if (!isErr(result)) {
      expect(result.value.recoveryCodes).toHaveLength(10);
      expect(new Set(result.value.recoveryCodes).size).toBe(10);
    }
    expect(enableMfa).toHaveBeenCalledWith("user-1");
    expect(saveRecoveryCodes).toHaveBeenCalledTimes(1);
    const [userId, hashes] = saveRecoveryCodes.mock.calls[0]!;
    expect(userId).toBe("user-1");
    expect(hashes).toHaveLength(10);
    // Nenhum hash gravado é igual a nenhum código em claro devolvido — nunca persiste em claro.
    if (!isErr(result)) {
      for (const plain of result.value.recoveryCodes) {
        expect(hashes).not.toContain(plain);
      }
    }
  });
});
