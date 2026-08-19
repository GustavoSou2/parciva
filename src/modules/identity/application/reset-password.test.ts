/**
 * Primeiro teste de `application/` neste módulo (o resto tem só
 * domain/infra) — exceção deliberada: a ordem de efeitos aqui é
 * segurança (invalidar sessão ANTES de criar a nova), vale testar
 * mesmo sem precedente local.
 */

import { describe, expect, it, vi } from "vitest";
import { isErr } from "@/shared/result";
import { resetPassword, type ResetPasswordDeps } from "./reset-password";

// `resetPassword` compara contra `Date.now()` real (mesmo padrão de
// `accept-invite.ts`, sem injeção de relógio) — por isso FUTURE/PAST são
// relativos ao momento em que o teste roda, nunca um ISO fixo.
const FUTURE = new Date(Date.now() + 30 * 60 * 1000);
const PAST = new Date(Date.now() - 60 * 60 * 1000);

interface Spies {
  readonly getPasswordResetByTokenHash: ReturnType<
    typeof vi.fn<(hash: string) => Promise<{ userId: string; expiresAt: Date } | null>>
  >;
  readonly setPassword: ReturnType<typeof vi.fn<(userId: string, passwordHash: string) => Promise<void>>>;
  readonly deleteAllSessionsForUser: ReturnType<typeof vi.fn<(userId: string) => Promise<void>>>;
  readonly deletePasswordResetToken: ReturnType<typeof vi.fn<(hash: string) => Promise<void>>>;
  readonly createSession: ReturnType<
    typeof vi.fn<(userId: string) => Promise<{ rawToken: string; expiresAt: Date }>>
  >;
}

function buildDeps(overrides: Partial<Spies> = {}): { deps: ResetPasswordDeps; spies: Spies } {
  const spies: Spies = {
    getPasswordResetByTokenHash: vi.fn().mockResolvedValue({ userId: "user-1", expiresAt: FUTURE }),
    setPassword: vi.fn().mockResolvedValue(undefined),
    deleteAllSessionsForUser: vi.fn().mockResolvedValue(undefined),
    deletePasswordResetToken: vi.fn().mockResolvedValue(undefined),
    createSession: vi.fn().mockResolvedValue({ rawToken: "raw-session-token", expiresAt: FUTURE }),
    ...overrides,
  };
  return { deps: spies, spies };
}

describe("resetPassword", () => {
  it("senha fraca -> Err too_short, nada é chamado", async () => {
    const { deps, spies } = buildDeps();
    const result = await resetPassword({ token: "tok", password: "curta" }, deps);
    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error).toBe("too_short");
    expect(spies.getPasswordResetByTokenHash).not.toHaveBeenCalled();
  });

  it("token não encontrado -> Err invalid_or_expired", async () => {
    const { deps } = buildDeps({ getPasswordResetByTokenHash: vi.fn().mockResolvedValue(null) });
    const result = await resetPassword({ token: "tok", password: "senha-boa-123" }, deps);
    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error).toBe("invalid_or_expired");
  });

  it("token expirado -> Err invalid_or_expired, nada é mutado", async () => {
    const { deps, spies } = buildDeps({
      getPasswordResetByTokenHash: vi.fn().mockResolvedValue({ userId: "user-1", expiresAt: PAST }),
    });
    const result = await resetPassword({ token: "tok", password: "senha-boa-123" }, deps);
    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error).toBe("invalid_or_expired");
    expect(spies.setPassword).not.toHaveBeenCalled();
  });

  it("sucesso: invalida sessões ANTES de criar a nova, na ordem certa", async () => {
    const callOrder: string[] = [];
    const { deps, spies } = buildDeps({
      setPassword: vi.fn().mockImplementation(() => {
        callOrder.push("setPassword");
        return Promise.resolve();
      }),
      deleteAllSessionsForUser: vi.fn().mockImplementation(() => {
        callOrder.push("deleteAllSessionsForUser");
        return Promise.resolve();
      }),
      deletePasswordResetToken: vi.fn().mockImplementation(() => {
        callOrder.push("deletePasswordResetToken");
        return Promise.resolve();
      }),
      createSession: vi.fn().mockImplementation(() => {
        callOrder.push("createSession");
        return Promise.resolve({ rawToken: "raw-session-token", expiresAt: FUTURE });
      }),
    });

    const result = await resetPassword({ token: "tok", password: "senha-boa-123" }, deps);

    expect(isErr(result)).toBe(false);
    if (!isErr(result)) {
      expect(result.value.userId).toBe("user-1");
      expect(result.value.sessionToken).toBe("raw-session-token");
    }
    expect(callOrder).toEqual([
      "setPassword",
      "deleteAllSessionsForUser",
      "deletePasswordResetToken",
      "createSession",
    ]);
    expect(spies.createSession).toHaveBeenCalledWith("user-1");
  });
});
