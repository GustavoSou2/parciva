/**
 * Challenge de MFA no login — mesmo padrão stateless de
 * `deriveCsrfToken` (`session.ts`): HMAC sobre `SESSION_SECRET`, sem
 * tabela nem coluna nova. Existe pro intervalo entre "senha bateu" e
 * "código de 6 dígitos confirmado" — a sessão real só é criada depois
 * do segundo fator, então esse intervalo não pode já ter uma sessão.
 *
 * Domain-separado do CSRF pelo prefixo fixo no payload assinado
 * (`mfa:`) — mesmo `SESSION_SECRET`, mas a entrada do HMAC nunca
 * colide com a de `deriveCsrfToken` (que assina só o hash da sessão,
 * sem prefixo). TTL curto (5 min) embutido no próprio payload, não
 * depende de nada persistido expirar.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export const MFA_CHALLENGE_TTL_MS = 5 * 60 * 1000;

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export function createMfaChallenge(userId: string, secret: string, now: Date = new Date()): string {
  const expiresAt = now.getTime() + MFA_CHALLENGE_TTL_MS;
  const payload = `mfa:${userId}:${expiresAt}`;
  const signature = sign(payload, secret);
  return Buffer.from(payload).toString("base64url") + "." + signature;
}

/** Devolve o `userId` se o challenge for válido e ainda não tiver expirado — `null` em qualquer outro caso (nunca lança). */
export function verifyMfaChallenge(token: string, secret: string, now: Date = new Date()): string | null {
  const separatorIndex = token.lastIndexOf(".");
  if (separatorIndex === -1) return null;

  const encodedPayload = token.slice(0, separatorIndex);
  const signature = token.slice(separatorIndex + 1);

  let payload: string;
  try {
    payload = Buffer.from(encodedPayload, "base64url").toString("utf8");
  } catch {
    return null;
  }

  const expectedSignature = sign(payload, secret);
  const candidateBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expectedSignature);
  if (candidateBuf.length !== expectedBuf.length || !timingSafeEqual(candidateBuf, expectedBuf)) {
    return null;
  }

  const parts = payload.split(":");
  if (parts.length !== 3 || parts[0] !== "mfa") return null;
  const [, userId, expiresAtRaw] = parts;
  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt) || expiresAt < now.getTime()) return null;

  return userId!;
}
