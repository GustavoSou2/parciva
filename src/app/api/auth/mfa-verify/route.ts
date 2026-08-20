/**
 * Segunda etapa do login com MFA ativo — spec §10.2. Recebe o
 * challenge devolvido por `POST /api/auth/login` mais o código (TOTP
 * ou recuperação) e só então cria a sessão de verdade. Rate limit por
 * IP (mesmo princípio do login normal — código de 6 dígitos tem só
 * 1 milhão de combinações, precisa de limite de tentativa).
 */

import { NextResponse, type NextRequest } from "next/server";
import {
  getMfaState,
  consumeRecoveryCode,
  createSession,
  touchLastLogin,
  verifyMfaLogin,
  listMembershipsForUser,
} from "@/modules/identity";
import { isErr } from "@/shared/result";
import { checkRateLimit } from "@/shared/rate-limit";
import { setSessionCookies, sessionSecret } from "@/app/_lib/session-cookies";

export const runtime = "nodejs";

interface MfaVerifyBody {
  challengeToken?: string;
  code?: string;
}

function clientIp(request: NextRequest): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: MfaVerifyBody;
  try {
    body = (await request.json()) as MfaVerifyBody;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  if (!body.challengeToken || !body.code) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const ip = clientIp(request);
  const perIp = await checkRateLimit(`mfa-verify:ip:${ip}`, 5, 60);
  if (!perIp.allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const result = await verifyMfaLogin(
    { challengeToken: body.challengeToken, code: body.code },
    {
      mfaChallengeSecret: sessionSecret(),
      getMfaState,
      consumeRecoveryCode,
      createSession,
      touchLastLogin,
    },
  );

  if (isErr(result)) {
    return NextResponse.json({ error: result.error }, { status: 401 });
  }

  const tenants = await listMembershipsForUser(result.value.userId);

  const response = NextResponse.json(
    { ok: true, tenants: tenants.map((t) => ({ slug: t.tenantSlug, name: t.tenantName })) },
    { status: 200 },
  );
  setSessionCookies(response, { token: result.value.sessionToken, expiresAt: result.value.expiresAt });
  return response;
}
