/**
 * Confirmar reset de senha — mesmo esqueleto de `accept-invite.ts`,
 * com uma diferença de segurança: invalida TODAS as sessões existentes
 * do usuário antes de criar a nova (se a senha precisou ser resetada,
 * sessões antigas não devem sobreviver). Login automático ao final,
 * mesmo raciocínio de `accept-invite.ts`: quem provou posse do link
 * não precisa digitar e-mail/senha de novo na sequência.
 */

import type { Result } from "@/shared/result";
import { err, isErr, ok } from "@/shared/result";
import { hashPassword } from "@/shared/password";
import { validatePassword, type PasswordPolicyError } from "../domain/password-policy";
import { hashPasswordResetToken } from "../domain/password-reset";

export interface ResetPasswordInput {
  readonly token: string;
  readonly password: string;
}

export interface ResetPasswordDeps {
  getPasswordResetByTokenHash(hash: string): Promise<{ userId: string; expiresAt: Date } | null>;
  setPassword(userId: string, passwordHash: string): Promise<void>;
  deleteAllSessionsForUser(userId: string): Promise<void>;
  deletePasswordResetToken(hash: string): Promise<void>;
  createSession(userId: string): Promise<{ rawToken: string; expiresAt: Date }>;
}

export type ResetPasswordError = PasswordPolicyError | "invalid_or_expired";

export async function resetPassword(
  input: ResetPasswordInput,
  deps: ResetPasswordDeps,
): Promise<Result<{ userId: string; sessionToken: string; expiresAt: Date }, ResetPasswordError>> {
  const passwordCheck = validatePassword(input.password);
  if (isErr(passwordCheck)) return passwordCheck;

  const tokenHash = hashPasswordResetToken(input.token);
  const reset = await deps.getPasswordResetByTokenHash(tokenHash);
  if (!reset || reset.expiresAt.getTime() < Date.now()) {
    return err("invalid_or_expired");
  }

  const passwordHash = await hashPassword(input.password);
  await deps.setPassword(reset.userId, passwordHash);
  // ANTES de criar a sessão nova — nunca depois, senão a sessão recém-criada seria apagada junto.
  await deps.deleteAllSessionsForUser(reset.userId);
  await deps.deletePasswordResetToken(tokenHash);

  const session = await deps.createSession(reset.userId);
  return ok({ userId: reset.userId, sessionToken: session.rawToken, expiresAt: session.expiresAt });
}
