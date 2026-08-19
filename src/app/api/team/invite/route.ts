/**
 * Convite de usuário — spec §14 Fase 0. Protegido em duas camadas:
 * `src/middleware.ts` (Edge, só checa presença do cookie) e aqui
 * (Node, valida sessão de verdade + resolve tenant pelo slug do corpo
 * + RBAC via `hasPermission`). Provedor real (Resend) desde
 * 19/08/2026 — o link continua sendo logado sempre, mesmo com envio
 * real configurado: única forma de testar sem depender de caixa de
 * entrada real, e sem conta Resend criada ainda (pendência,
 * DECISIONS.md) é a única confirmação disponível.
 * `identity/application/invite-user.ts` já trata o envio como
 * best-effort (try/catch) — não precisa de outro aqui.
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
  verifyCsrfToken,
  type MembershipRole,
} from "@/modules/identity";
import { isErr } from "@/shared/result";
import { logger } from "@/shared/logger";
import { sendEmail } from "@/shared/email";
import { SESSION_COOKIE_NAME } from "@/shared/session-cookie";

const CSRF_HEADER_NAME = "x-csrf-token";

function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET não configurado.");
  return secret;
}

function appBaseUrl(): string {
  const url = process.env.APP_BASE_URL;
  if (!url) throw new Error("APP_BASE_URL não configurado.");
  return url;
}

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

  // `/api/team/invite` é rota crua (não Server Action) — Next.js só
  // protege Server Actions contra CSRF checando `Origin` automaticamente
  // (decisão [16]). `SameSite=Lax` no cookie de sessão já cobre a maior
  // parte do risco, mas isto fecha a defesa em profundidade que ficou
  // pendente desde o Marco 2 (achado no Marco 3, nunca ligado).
  const csrfHeader = request.headers.get(CSRF_HEADER_NAME);
  if (!csrfHeader || !verifyCsrfToken(csrfHeader, sessionResult.value.sessionTokenHash, sessionSecret())) {
    return NextResponse.json({ error: "invalid_csrf_token" }, { status: 403 });
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
      sendInviteEmail: async (email, rawToken) => {
        // O token cru É a informação (não um vazamento a redigir) — é o
        // único jeito de testar o fluxo sem depender de caixa de
        // entrada real, ainda mais sem conta Resend criada (pendência).
        logger.info("link de convite", { email, link: `/invite/${rawToken}` });
        await sendEmail({
          to: email,
          subject: "Você foi convidado para a Parciva",
          html: `<p>Você foi convidado a entrar na Parciva.</p><p><a href="${appBaseUrl()}/invite/${rawToken}">Aceitar convite</a></p>`,
        });
      },
    },
  );

  if (isErr(result)) {
    return NextResponse.json({ error: result.error }, { status: 409 });
  }

  return NextResponse.json({ userId: result.value.userId }, { status: 201 });
}
