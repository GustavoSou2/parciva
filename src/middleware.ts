/**
 * Camada 1 (rápida, Edge) de proteção de sessão — spec §3.1. Só checa
 * se o cookie de sessão existe; NÃO valida contra o banco (o runtime
 * Edge não tem socket TCP cru, que `postgres-js` exige — mesmo motivo
 * de `export const runtime = "nodejs"` no webhook do WhatsApp). A
 * validação real (hash contra `sessions`, expiração) acontece na
 * camada 2, dentro de cada route handler/página protegida, via
 * `identity/application/require-session.ts` — é essa que decide de
 * verdade; esta aqui só evita I/O desnecessário pra tráfego
 * obviamente não autenticado.
 *
 * `matcher` cobre hoje só `/api/team/*` (única rota protegida que
 * existe no Marco 2 — convite de usuário). Quando o Marco 3 trouxer as
 * telas de Contratos/Pagadores sob um grupo `(app)`, o prefixo delas
 * entra aqui também.
 */

import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "@/shared/session-cookie";

export function middleware(request: NextRequest): NextResponse {
  const hasSessionCookie = request.cookies.has(SESSION_COOKIE_NAME);
  if (!hasSessionCookie) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/api/team/:path*"],
};
