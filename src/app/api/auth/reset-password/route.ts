/**
 * Confirmar reset de senha — mesma forma de `accept-invite/route.ts`:
 * seta cookies de sessão e devolve a lista de tenants do usuário (não
 * um `tenantSlug` único — reset não é ligado a UM convite/tenant, ao
 * contrário de aceitar convite).
 */

import { NextResponse, type NextRequest } from "next/server";
import {
  deleteAllSessionsForUser,
  deletePasswordResetToken,
  getPasswordResetByTokenHash,
  createSession,
  listMembershipsForUser,
  resetPassword,
  setPassword,
} from "@/modules/identity";
import { isErr } from "@/shared/result";
import { setSessionCookies } from "@/app/_lib/session-cookies";

export const runtime = "nodejs";

interface ResetPasswordBody {
  token?: string;
  password?: string;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: ResetPasswordBody;
  try {
    body = (await request.json()) as ResetPasswordBody;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  if (!body.token || !body.password) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const result = await resetPassword(
    { token: body.token, password: body.password },
    {
      getPasswordResetByTokenHash,
      setPassword,
      deleteAllSessionsForUser,
      deletePasswordResetToken,
      createSession,
    },
  );

  if (isErr(result)) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const tenants = await listMembershipsForUser(result.value.userId);

  const response = NextResponse.json(
    { ok: true, tenants: tenants.map((t) => ({ slug: t.tenantSlug, name: t.tenantName })) },
    { status: 200 },
  );
  setSessionCookies(response, { token: result.value.sessionToken, expiresAt: result.value.expiresAt });
  return response;
}
