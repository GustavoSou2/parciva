/**
 * Aceitar convite — define a senha (só agora o usuário convidado passa
 * a existir de fato pra login) e marca a `membership` como aceita.
 * Login automático ao final — quem acabou de provar posse do link não
 * precisa digitar e-mail/senha de novo na sequência.
 */

import type { Result } from "@/shared/result";
import { err, isErr, ok } from "@/shared/result";
import { hashPassword } from "@/shared/password";
import { validatePassword, type PasswordPolicyError } from "../domain/password-policy";
import { hashInviteToken } from "../domain/invite";

export interface AcceptInviteInput {
  readonly token: string;
  readonly password: string;
}

export interface AcceptInviteDeps {
  getInviteByTokenHash(
    hash: string,
  ): Promise<{ userId: string; tenantId: string; expiresAt: Date } | null>;
  setPassword(userId: string, passwordHash: string): Promise<void>;
  acceptMembership(tenantId: string, userId: string): Promise<void>;
  deleteInviteToken(hash: string): Promise<void>;
  createSession(userId: string): Promise<{ rawToken: string; expiresAt: Date }>;
}

export type AcceptInviteError = PasswordPolicyError | "invalid_or_expired";

export async function acceptInvite(
  input: AcceptInviteInput,
  deps: AcceptInviteDeps,
): Promise<
  Result<
    { userId: string; tenantId: string; sessionToken: string; expiresAt: Date },
    AcceptInviteError
  >
> {
  const passwordCheck = validatePassword(input.password);
  if (isErr(passwordCheck)) return passwordCheck;

  const tokenHash = hashInviteToken(input.token);
  const invite = await deps.getInviteByTokenHash(tokenHash);
  if (!invite || invite.expiresAt.getTime() < Date.now()) {
    return err("invalid_or_expired");
  }

  const passwordHash = await hashPassword(input.password);
  await deps.setPassword(invite.userId, passwordHash);
  await deps.acceptMembership(invite.tenantId, invite.userId);
  await deps.deleteInviteToken(tokenHash);

  const session = await deps.createSession(invite.userId);
  return ok({
    userId: invite.userId,
    tenantId: invite.tenantId,
    sessionToken: session.rawToken,
    expiresAt: session.expiresAt,
  });
}
