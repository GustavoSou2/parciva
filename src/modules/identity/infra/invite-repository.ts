/**
 * `invite_tokens` é tabela raiz (ver comentário em `db/schema/
 * tenancy.ts`) — sempre via `getRootDb()`.
 */

import { eq } from "drizzle-orm";
import { getRootDb } from "@/db/client";
import { inviteTokens } from "@/db/schema/tenancy";
import { generateInviteToken, hashInviteToken, inviteExpiresAt } from "../domain/invite";

export interface CreatedInvite {
  readonly rawToken: string;
  readonly expiresAt: Date;
}

export async function createInviteToken(userId: string, tenantId: string): Promise<CreatedInvite> {
  const rawToken = generateInviteToken();
  const tokenHash = hashInviteToken(rawToken);
  const expiresAt = inviteExpiresAt();

  await getRootDb().insert(inviteTokens).values({ id: tokenHash, userId, tenantId, expiresAt });

  return { rawToken, expiresAt };
}

export async function getInviteByTokenHash(
  tokenHash: string,
): Promise<{ userId: string; tenantId: string; expiresAt: Date } | null> {
  const rows = await getRootDb()
    .select({ userId: inviteTokens.userId, tenantId: inviteTokens.tenantId, expiresAt: inviteTokens.expiresAt })
    .from(inviteTokens)
    .where(eq(inviteTokens.id, tokenHash))
    .limit(1);
  return rows[0] ?? null;
}

export async function deleteInviteToken(tokenHash: string): Promise<void> {
  await getRootDb().delete(inviteTokens).where(eq(inviteTokens.id, tokenHash));
}
