import { NextResponse, type NextRequest } from "next/server";
import {
  acceptInvite,
  acceptMembership,
  createSession,
  deleteInviteToken,
  getInviteByTokenHash,
  setPassword,
} from "@/modules/identity";
import { getTenantSlugById } from "@/modules/tenant";
import { isErr } from "@/shared/result";
import { SESSION_COOKIE_NAME } from "@/shared/session-cookie";

export const runtime = "nodejs";

interface AcceptInviteBody {
  token?: string;
  password?: string;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: AcceptInviteBody;
  try {
    body = (await request.json()) as AcceptInviteBody;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  if (!body.token || !body.password) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const result = await acceptInvite(
    { token: body.token, password: body.password },
    {
      getInviteByTokenHash,
      setPassword,
      acceptMembership: (tenantId, userId) => acceptMembership({ tenantId }, userId),
      deleteInviteToken,
      createSession,
    },
  );

  if (isErr(result)) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const tenantSlug = await getTenantSlugById(result.value.tenantId);
  const response = NextResponse.json({ ok: true, tenantSlug }, { status: 200 });
  response.cookies.set(SESSION_COOKIE_NAME, result.value.sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: result.value.expiresAt,
  });
  return response;
}
