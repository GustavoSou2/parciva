/**
 * Login — spec §10.2: rate limit 5/min e 20/h no login, por IP e por
 * conta. As duas janelas checadas antes de tocar senha — barato,
 * evita gastar CPU do Argon2id em tentativa já condenada a falhar.
 */

import { NextResponse, type NextRequest } from "next/server";
import { getUserByEmail, createSession, touchLastLogin, login } from "@/modules/identity";
import { isErr } from "@/shared/result";
import { checkRateLimit } from "@/shared/rate-limit";
import { SESSION_COOKIE_NAME } from "@/shared/session-cookie";

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
    { getUserByEmail, createSession, touchLastLogin },
  );

  if (isErr(result)) {
    return NextResponse.json({ error: result.error }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true }, { status: 200 });
  response.cookies.set(SESSION_COOKIE_NAME, result.value.sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: result.value.expiresAt,
  });
  return response;
}
