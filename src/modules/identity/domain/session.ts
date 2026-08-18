/**
 * Sessão — spec §3.1 ("sessões no Postgres próprio"). Puro no sentido
 * de não tocar banco/rede — usa só `node:crypto` sobre bytes já em
 * memória, mesmo espírito de `shared/document.ts`/`shared/money.ts`.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { generateToken, hashToken } from "./token";

/** Sem duração explícita na spec — 7 dias é o padrão adotado (produto financeiro, sessão mais curta que "lembrar por 30 dias"). */
export const SESSION_DURATION_DAYS = 7;

export const generateSessionToken = generateToken;
export const hashSessionToken = hashToken;

export function sessionExpiresAt(from: Date = new Date()): Date {
  return new Date(from.getTime() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000);
}

/**
 * Token CSRF derivado do hash da sessão via HMAC — não precisa de
 * armazenamento próprio (nem tabela nova, nem coluna): é sempre
 * recalculável a partir do `sessionSecret` (variável de ambiente,
 * nunca no banco) + do hash da sessão já persistido. Comparação em
 * tempo constante (`timingSafeEqual`) — comparação ingênua de string
 * vazaria o token por timing.
 */
export function deriveCsrfToken(sessionTokenHash: string, sessionSecret: string): string {
  return createHmac("sha256", sessionSecret).update(sessionTokenHash).digest("hex");
}

export function verifyCsrfToken(
  candidate: string,
  sessionTokenHash: string,
  sessionSecret: string,
): boolean {
  const expected = deriveCsrfToken(sessionTokenHash, sessionSecret);
  const candidateBuf = Buffer.from(candidate, "hex");
  const expectedBuf = Buffer.from(expected, "hex");
  if (candidateBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(candidateBuf, expectedBuf);
}
