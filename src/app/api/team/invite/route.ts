/**
 * Convite de usuário — spec §14 Fase 0. Protegido em duas camadas:
 * `src/middleware.ts` (Edge, só checa presença do cookie) e aqui
 * (Node, valida sessão de verdade + resolve tenant pelo slug do corpo
 * + RBAC via `hasPermission`). Link de convite só é logado (dev) — sem
 * provedor de e-mail configurado ainda, ver `identity/application/
 * invite-user.ts`.
 */

import { NextResponse, type NextRequest } from "next/server";
import {
  createInviteToken,
  createMembership,
  createUser,
  getMembership,
  getSessionByTokenHash,
  getUserByEmail,
  hasPermission,
  inviteUser,
  membershipExists,
  requireSession,
  resolveTenantContext,
  type MembershipRole,
} from "@/modules/identity";
import { isErr } from "@/shared/result";
import { SESSION_COOKIE_NAME } from "@/shared/session-cookie";

export const runtime = "nodejs";

interface InviteBody {
  tenantSlug?: string;
  email?: string;
  name?: string;
  role?: MembershipRole;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const sessionResult = await requireSession(request.cookies.get(SESSION_COOKIE_NAME)?.value, {
    getSessionByTokenHash,
  });
  if (isErr(sessionResult)) {
    return NextResponse.json({ error: sessionResult.error }, { status: 401 });
  }

  let body: InviteBody;
  try {
    body = (await request.json()) as InviteBody;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  if (!body.tenantSlug || !body.email || !body.name || !body.role) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const tenantResult = await resolveTenantContext(sessionResult.value.userId, body.tenantSlug, {
    getMembership,
  });
  if (isErr(tenantResult)) {
    return NextResponse.json({ error: tenantResult.error }, { status: 404 });
  }

  if (!hasPermission(tenantResult.value.role, "members:write")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 403 });
  }

  const ctx = { tenantId: tenantResult.value.tenantId };
  const result = await inviteUser(
    ctx,
    { email: body.email, name: body.name, role: body.role, inviterUserId: sessionResult.value.userId },
    {
      getUserByEmail,
      membershipExists: (userId) => membershipExists(ctx, userId),
      createInvitedUser: (email, name) => createUser({ email, name, status: "invited" }),
      createMembership: (userId, role, invitedBy) => createMembership(ctx, userId, role, invitedBy),
      createInviteToken: (userId) => createInviteToken(userId, ctx.tenantId),
      sendInviteEmail: (email, rawToken) => {
        // Sem provedor de e-mail configurado — loga o link (dev). Ver
        // identity/application/invite-user.ts (best-effort, mesma
        // situação de sendWelcomeEmail em tenant/create-tenant.ts).
        console.log(`[convite] link para ${email}: /invite/${rawToken}`);
        return Promise.resolve();
      },
    },
  );

  if (isErr(result)) {
    return NextResponse.json({ error: result.error }, { status: 409 });
  }

  return NextResponse.json({ userId: result.value.userId }, { status: 201 });
}
