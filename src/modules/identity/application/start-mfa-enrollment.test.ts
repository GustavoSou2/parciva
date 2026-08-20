import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { decryptSecret } from "@/shared/crypto";
import { base32Decode } from "../domain/totp";
import { startMfaEnrollment, type StartMfaEnrollmentDeps } from "./start-mfa-enrollment";

beforeEach(() => {
  process.env.ENCRYPTION_KEY = randomBytes(32).toString("base64");
});

describe("startMfaEnrollment", () => {
  it("gera segredo, grava cifrado, e devolve o mesmo segredo em base32 + URI otpauth", async () => {
    const setPendingMfaSecret = vi.fn<StartMfaEnrollmentDeps["setPendingMfaSecret"]>().mockResolvedValue(undefined);

    const result = await startMfaEnrollment("user-1", "dono@empresa.com", { setPendingMfaSecret });

    expect(setPendingMfaSecret).toHaveBeenCalledTimes(1);
    const [userId, encryptedRef] = setPendingMfaSecret.mock.calls[0]!;
    expect(userId).toBe("user-1");

    const decryptedSecretBase64 = decryptSecret(encryptedRef);
    const decryptedSecret = Buffer.from(decryptedSecretBase64, "base64");
    expect(base32Decode(result.secretBase32)).toEqual(decryptedSecret);
    expect(result.otpauthUri).toContain(`secret=${result.secretBase32}`);
    expect(result.otpauthUri).toContain(encodeURIComponent("Parciva:dono@empresa.com"));
  });

  it("duas ativações seguidas geram segredos diferentes (sobrescreve, não reaproveita)", async () => {
    const setPendingMfaSecret = vi.fn<StartMfaEnrollmentDeps["setPendingMfaSecret"]>().mockResolvedValue(undefined);
    const first = await startMfaEnrollment("user-1", "dono@empresa.com", { setPendingMfaSecret });
    const second = await startMfaEnrollment("user-1", "dono@empresa.com", { setPendingMfaSecret });
    expect(first.secretBase32).not.toBe(second.secretBase32);
  });
});
