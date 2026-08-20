import { describe, expect, it, vi } from "vitest";
import { hashPassword } from "@/shared/password";
import { isErr } from "@/shared/result";
import { disableMfaWithPassword, type DisableMfaDeps } from "./disable-mfa";

describe("disableMfaWithPassword", () => {
  it("usuário sem senha (SSO) -> Err invalid_password", async () => {
    const disableMfa = vi.fn();
    const deps: DisableMfaDeps = {
      getUserById: vi.fn().mockResolvedValue({ passwordHash: null }),
      disableMfa,
    };
    const result = await disableMfaWithPassword("user-1", "qualquer", deps);
    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error).toBe("invalid_password");
    expect(disableMfa).not.toHaveBeenCalled();
  });

  it("senha errada -> Err invalid_password, MFA continua ativo", async () => {
    const passwordHash = await hashPassword("senha-correta-123");
    const disableMfa = vi.fn();
    const deps: DisableMfaDeps = {
      getUserById: vi.fn().mockResolvedValue({ passwordHash }),
      disableMfa,
    };
    const result = await disableMfaWithPassword("user-1", "senha-errada", deps);
    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error).toBe("invalid_password");
    expect(disableMfa).not.toHaveBeenCalled();
  });

  it("senha certa -> desativa", async () => {
    const passwordHash = await hashPassword("senha-correta-123");
    const disableMfa = vi.fn().mockResolvedValue(undefined);
    const deps: DisableMfaDeps = { getUserById: vi.fn().mockResolvedValue({ passwordHash }), disableMfa };
    const result = await disableMfaWithPassword("user-1", "senha-correta-123", deps);
    expect(isErr(result)).toBe(false);
    expect(disableMfa).toHaveBeenCalledWith("user-1");
  });
});
