/**
 * Segunda camada de defesa da sessão (a primeira é o middleware Edge,
 * que só checa presença do cookie — ver `src/middleware.ts`). Esta é a
 * que decide de verdade: valida o hash contra `sessions` e a
 * expiração. Chamada em toda página/route handler protegido, runtime
 * Node (mesmo motivo do webhook do WhatsApp não rodar em Edge —
 * `postgres-js` exige socket TCP cru).
 */

import type { Result } from "@/shared/result";
import { err, ok } from "@/shared/result";
import { hashSessionToken } from "../domain/session";

export interface RequireSessionDeps {
  getSessionByTokenHash(hash: string): Promise<{ userId: string; expiresAt: Date } | null>;
}

export type RequireSessionError = "no_session" | "expired";

export async function requireSession(
  rawToken: string | undefined,
  deps: RequireSessionDeps,
): Promise<Result<{ userId: string; sessionTokenHash: string }, RequireSessionError>> {
  if (!rawToken) return err("no_session");

  const sessionTokenHash = hashSessionToken(rawToken);
  const session = await deps.getSessionByTokenHash(sessionTokenHash);
  if (!session) return err("no_session");
  if (session.expiresAt.getTime() < Date.now()) return err("expired");

  return ok({ userId: session.userId, sessionTokenHash });
}
