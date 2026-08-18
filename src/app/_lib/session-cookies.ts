/**
 * Grava/limpa sessão + CSRF juntos nas 3 rotas que criam sessão
 * (login, signup, accept-invite) — um só lugar decide as opções do
 * cookie, em vez de repetir `httpOnly`/`sameSite`/`secure` em cada
 * rota. Runtime Node só (usa `node:crypto` via `deriveCsrfToken`) —
 * fora de `src/shared/` de propósito, que precisa continuar seguro
 * pro middleware Edge (`src/middleware.ts`).
 */

import type { NextResponse } from "next/server";
import { deriveCsrfToken, hashSessionToken } from "@/modules/identity";
import { CSRF_COOKIE_NAME, SESSION_COOKIE_NAME } from "@/shared/session-cookie";

function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET não configurado.");
  return secret;
}

export function setSessionCookies(
  response: NextResponse,
  session: { token: string; expiresAt: Date },
): void {
  const isProd = process.env.NODE_ENV === "production";

  response.cookies.set(SESSION_COOKIE_NAME, session.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProd,
    path: "/",
    expires: session.expiresAt,
  });

  const csrfToken = deriveCsrfToken(hashSessionToken(session.token), sessionSecret());
  response.cookies.set(CSRF_COOKIE_NAME, csrfToken, {
    httpOnly: false, // JS de cliente precisa ler pra ecoar no header — ver session-cookie.ts
    sameSite: "lax",
    secure: isProd,
    path: "/",
    expires: session.expiresAt,
  });
}

export function clearSessionCookies(response: NextResponse): void {
  response.cookies.delete(SESSION_COOKIE_NAME);
  response.cookies.delete(CSRF_COOKIE_NAME);
}
