/**
 * `password_reset_tokens` é tabela raiz (ver comentário em `db/schema/
 * tenancy.ts`) — sempre via `getRootDb()`. Mesma estrutura de
 * `invite-repository.ts`, sem `tenantId`.
 */

import { eq } from "drizzle-orm";
import { getRootDb } from "@/db/client";
import { passwordResetTokens } from "@/db/schema/tenancy";
import { generatePasswordResetToken, hashPasswordResetToken, passwordResetExpiresAt } from "../domain/password-reset";

export interface CreatedPasswordReset {
  readonly rawToken: string;
  readonly expiresAt: Date;
}

export async function createPasswordResetToken(userId: string): Promise<CreatedPasswordReset> {
  const rawToken = generatePasswordResetToken();
  const tokenHash = hashPasswordResetToken(rawToken);
  const expiresAt = passwordResetExpiresAt();

  await getRootDb().insert(passwordResetTokens).values({ id: tokenHash, userId, expiresAt });

  return { rawToken, expiresAt };
}

export async function getPasswordResetByTokenHash(
  tokenHash: string,
): Promise<{ userId: string; expiresAt: Date } | null> {
  const rows = await getRootDb()
    .select({ userId: passwordResetTokens.userId, expiresAt: passwordResetTokens.expiresAt })
    .from(passwordResetTokens)
    .where(eq(passwordResetTokens.id, tokenHash))
    .limit(1);
  return rows[0] ?? null;
}

export async function deletePasswordResetToken(tokenHash: string): Promise<void> {
  await getRootDb().delete(passwordResetTokens).where(eq(passwordResetTokens.id, tokenHash));
}
