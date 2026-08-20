import { describe, expect, it, vi } from "vitest";
import { hashPassword } from "@/shared/password";
import { isErr } from "@/shared/result";
import { login, type LoginDeps } from "./login";

const FUTURE = new Date(Date.now() + 30 * 60 * 1000);

interface Spies {
  readonly getUserByEmail: ReturnType<
    typeof vi.fn<(email: string) => Promise<{ id: string; passwordHash: string | null; mfaEnabled: boolean } | null>>
  >;
  readonly createSession: ReturnType<
    typeof vi.fn<(userId: string) => Promise<{ rawToken: string; expiresAt: Date }>>
  >;
  readonly touchLastLogin: ReturnType<typeof vi.fn<(userId: string) => Promise<void>>>;
  readonly createMfaChallenge: ReturnType<typeof vi.fn<(userId: string) => string>>;
}

async function buildDeps(overrides: Partial<Spies> = {}): Promise<{ deps: LoginDeps; spies: Spies }> {
  const passwordHash = await hashPassword("senha-correta-123");
  const spies: Spies = {
    getUserByEmail: vi.fn().mockResolvedValue({ id: "user-1", passwordHash, mfaEnabled: false }),
    createSession: vi.fn().mockResolvedValue({ rawToken: "raw-session-token", expiresAt: FUTURE }),
    touchLastLogin: vi.fn().mockResolvedValue(undefined),
    createMfaChallenge: vi.fn().mockReturnValue("challenge-token"),
    ...overrides,
  };
  return { deps: spies, spies };
}

describe("login", () => {
  it("usuário inexistente -> Err invalid_credentials, sem verificar senha", async () => {
    const { deps } = await buildDeps({ getUserByEmail: vi.fn().mockResolvedValue(null) });
    const result = await login({ email: "x@x.com", password: "qualquer" }, deps);
    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error).toBe("invalid_credentials");
  });

  it("usuário convidado sem senha definida -> Err invalid_credentials", async () => {
    const { deps } = await buildDeps({
      getUserByEmail: vi.fn().mockResolvedValue({ id: "user-1", passwordHash: null, mfaEnabled: false }),
    });
    const result = await login({ email: "x@x.com", password: "qualquer" }, deps);
    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error).toBe("invalid_credentials");
  });

  it("senha errada -> Err invalid_credentials, mesmo erro genérico de sempre", async () => {
    const { deps } = await buildDeps();
    const result = await login({ email: "x@x.com", password: "senha-errada" }, deps);
    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error).toBe("invalid_credentials");
  });

  it("senha certa, MFA desativado -> cria sessão direto", async () => {
    const { deps, spies } = await buildDeps();
    const result = await login({ email: "x@x.com", password: "senha-correta-123" }, deps);
    expect(isErr(result)).toBe(false);
    if (!isErr(result)) {
      expect(result.value.kind).toBe("session");
      if (result.value.kind === "session") expect(result.value.sessionToken).toBe("raw-session-token");
    }
    expect(spies.createSession).toHaveBeenCalledWith("user-1");
    expect(spies.touchLastLogin).toHaveBeenCalledWith("user-1");
    expect(spies.createMfaChallenge).not.toHaveBeenCalled();
  });

  it("senha certa, MFA ativado -> devolve challenge, NUNCA cria sessão nem toca last login", async () => {
    const { deps, spies } = await buildDeps({
      getUserByEmail: vi
        .fn()
        .mockResolvedValue({ id: "user-1", passwordHash: await hashPassword("senha-correta-123"), mfaEnabled: true }),
    });
    const result = await login({ email: "x@x.com", password: "senha-correta-123" }, deps);
    expect(isErr(result)).toBe(false);
    if (!isErr(result)) {
      expect(result.value.kind).toBe("mfa_required");
      if (result.value.kind === "mfa_required") expect(result.value.challengeToken).toBe("challenge-token");
    }
    expect(spies.createMfaChallenge).toHaveBeenCalledWith("user-1");
    expect(spies.createSession).not.toHaveBeenCalled();
    expect(spies.touchLastLogin).not.toHaveBeenCalled();
  });
});
