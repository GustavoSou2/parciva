/**
 * `sessions` é tabela raiz (ver comentário em `db/schema/tenancy.ts`) —
 * sempre via `getRootDb()`.
 */

import { eq } from "drizzle-orm";
import { getRootDb } from "@/db/client";
import { sessions } from "@/db/schema/tenancy";
import { generateSessionToken, hashSessionToken, sessionExpiresAt } from "../domain/session";

export interface CreatedSession {
  readonly rawToken: string;
  readonly tokenHash: string;
  readonly expiresAt: Date;
}

export async function createSession(
  userId: string,
  meta: { userAgent?: string; ip?: string } = {},
): Promise<CreatedSession> {
  const rawToken = generateSessionToken();
  const tokenHash = hashSessionToken(rawToken);
  const expiresAt = sessionExpiresAt();

  await getRootDb().insert(sessions).values({
    id: tokenHash,
    userId,
    userAgent: meta.userAgent ?? null,
    ip: meta.ip ?? null,
    expiresAt,
  });

  return { rawToken, tokenHash, expiresAt };
}

export async function getSessionByTokenHash(
  tokenHash: string,
): Promise<{ userId: string; expiresAt: Date } | null> {
  const rows = await getRootDb()
    .select({ userId: sessions.userId, expiresAt: sessions.expiresAt })
    .from(sessions)
    .where(eq(sessions.id, tokenHash))
    .limit(1);
  return rows[0] ?? null;
}

export async function deleteSession(tokenHash: string): Promise<void> {
  await getRootDb().delete(sessions).where(eq(sessions.id, tokenHash));
}

/** Usado por `reset-password.ts` — se a senha foi resetada (ex.: possível vazamento), sessões antigas não devem sobreviver. */
export async function deleteAllSessionsForUser(userId: string): Promise<void> {
  await getRootDb().delete(sessions).where(eq(sessions.userId, userId));
}
