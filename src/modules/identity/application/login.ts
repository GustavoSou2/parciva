/**
 * Login — spec §3.1/§10.2. Sem `TenantContext`: autenticação acontece
 * antes de qualquer tenant estar resolvido (mesmo raciocínio de
 * `resolve-tenant-context.ts`).
 *
 * Erro único e genérico (`invalid_credentials`) pra e-mail inexistente,
 * senha errada, e usuário convidado que nunca definiu senha — nunca dar
 * pista de qual dos três é o caso real (username enumeration).
 */

import type { Result } from "@/shared/result";
import { err, ok } from "@/shared/result";
import { verifyPassword } from "@/shared/password";

export interface LoginInput {
  readonly email: string;
  readonly password: string;
}

export interface LoginDeps {
  getUserByEmail(email: string): Promise<{ id: string; passwordHash: string | null } | null>;
  createSession(userId: string): Promise<{ rawToken: string; expiresAt: Date }>;
  touchLastLogin(userId: string): Promise<void>;
}

export type LoginError = "invalid_credentials";

export async function login(
  input: LoginInput,
  deps: LoginDeps,
): Promise<Result<{ userId: string; sessionToken: string; expiresAt: Date }, LoginError>> {
  const email = input.email.trim().toLowerCase();
  const user = await deps.getUserByEmail(email);
  if (!user || !user.passwordHash) return err("invalid_credentials");

  const valid = await verifyPassword(user.passwordHash, input.password);
  if (!valid) return err("invalid_credentials");

  const session = await deps.createSession(user.id);
  await deps.touchLastLogin(user.id);

  return ok({ userId: user.id, sessionToken: session.rawToken, expiresAt: session.expiresAt });
}
