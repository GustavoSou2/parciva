/**
 * Login — spec §10.2: rate limit 5/min e 20/h no login, por IP e por
 * conta. As duas janelas checadas antes de tocar senha — barato,
 * evita gastar CPU do Argon2id em tentativa já condenada a falhar.
 */

import { NextResponse, type NextRequest } from "next/server";
import {
  getUserByEmail,
  createSession,
  touchLastLogin,
  createMfaChallenge,
  login,
  listMembershipsForUser,
} from "@/modules/identity";
import { isErr } from "@/shared/result";
import { checkRateLimit } from "@/shared/rate-limit";
import { setSessionCookies, sessionSecret } from "@/app/_lib/session-cookies";

export const runtime = "nodejs";

interface LoginBody {
  email?: string;
  password?: string;
}

function clientIp(request: NextRequest): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: LoginBody;
  try {
    body = (await request.json()) as LoginBody;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  if (!body.email || !body.password) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const email = body.email.trim().toLowerCase();
  const ip = clientIp(request);

  const perIp = await checkRateLimit(`login:ip:${ip}`, 5, 60);
  const perAccount = await checkRateLimit(`login:email:${email}`, 20, 60 * 60);
  if (!perIp.allowed || !perAccount.allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const result = await login(
    { email, password: body.password },
    {
      getUserByEmail,
      createSession,
      touchLastLogin,
      createMfaChallenge: (userId) => createMfaChallenge(userId, sessionSecret()),
    },
  );

  if (isErr(result)) {
    return NextResponse.json({ error: result.error }, { status: 401 });
  }

  // MFA ativo — senha bateu, mas a sessão só é criada depois do segundo
  // fator (`POST /api/auth/mfa-verify`). Nenhum cookie é setado aqui.
  if (result.value.kind === "mfa_required") {
    return NextResponse.json({ mfaRequired: true, challengeToken: result.value.challengeToken }, { status: 200 });
  }

  // Resolve pra quais tenants este usuário pode ir — sem isso o cliente
  // não tem como saber pra onde redirecionar (ver DECISIONS.md, "login
  // não sabe pra qual tenant redirecionar"). `getUserDb`/policy
  // `self_membership_lookup` (0010_membership_self_lookup_rls.sql)
  // resolvem isso sem bypassar RLS.
  const tenants = await listMembershipsForUser(result.value.userId);

  const response = NextResponse.json(
    { ok: true, tenants: tenants.map((t) => ({ slug: t.tenantSlug, name: t.tenantName })) },
    { status: 200 },
  );
  setSessionCookies(response, { token: result.value.sessionToken, expiresAt: result.value.expiresAt });
  return response;
}
