/**
 * Signup self-service — spec §4.3. Cria tenant + owner e já loga
 * (mesmo padrão de `accept-invite`: quem acabou de provar identidade
 * não deveria precisar logar de novo na sequência).
 */

import { NextResponse, type NextRequest } from "next/server";
import { createTenant, getPlanLimits, saveMembership, saveTenant, saveUser, sendWelcomeEmail, slugExists } from "@/modules/tenant";
import { createSession } from "@/modules/identity";
import { isErr } from "@/shared/result";
import { setSessionCookies } from "@/app/_lib/session-cookies";

export const runtime = "nodejs";

interface SignupBody {
  name?: string;
  ownerName?: string;
  ownerEmail?: string;
  ownerPassword?: string;
  planCode?: string;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: SignupBody;
  try {
    body = (await request.json()) as SignupBody;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  if (!body.name || !body.ownerName || !body.ownerEmail || !body.ownerPassword) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const result = await createTenant(
    {
      name: body.name,
      ownerName: body.ownerName,
      ownerEmail: body.ownerEmail,
      ownerPassword: body.ownerPassword,
      planCode: body.planCode ?? "free",
    },
    { slugExists, getPlanLimits, saveTenant, saveUser, saveMembership, sendWelcomeEmail },
  );

  if (isErr(result)) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const session = await createSession(result.value.userId);
  const response = NextResponse.json({ tenantSlug: result.value.slug }, { status: 201 });
  setSessionCookies(response, { token: session.rawToken, expiresAt: session.expiresAt });
  return response;
}
