/**
 * Pedido de "esqueci minha senha" — rate limit por IP e por e-mail
 * (mesma função de `login/route.ts`, `checkRateLimit`) evita spam de
 * e-mail e reduz o valor de usar isto como oráculo de enumeração.
 * Sempre `200 {ok:true}`, exista ou não o e-mail — `requestPasswordReset`
 * (identity) já não distingue os dois casos internamente.
 */

import { NextResponse, type NextRequest } from "next/server";
import {
  createPasswordResetToken,
  getUserByEmail,
  requestPasswordReset,
} from "@/modules/identity";
import { checkRateLimit } from "@/shared/rate-limit";
import { sendEmail } from "@/shared/email";
import { logger } from "@/shared/logger";

export const runtime = "nodejs";

interface RequestPasswordResetBody {
  email?: string;
}

function appBaseUrl(): string {
  const url = process.env.APP_BASE_URL;
  if (!url) throw new Error("APP_BASE_URL não configurado.");
  return url;
}

function clientIp(request: NextRequest): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: RequestPasswordResetBody;
  try {
    body = (await request.json()) as RequestPasswordResetBody;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  if (!body.email) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const email = body.email.trim().toLowerCase();
  const ip = clientIp(request);

  const perIp = await checkRateLimit(`password-reset:ip:${ip}`, 5, 60 * 60);
  const perEmail = await checkRateLimit(`password-reset:email:${email}`, 3, 60 * 60);
  if (!perIp.allowed || !perEmail.allowed) {
    // Mesma resposta de sucesso mesmo rate-limitado — não revela se o
    // e-mail existe nem se o rate limit disparou.
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  await requestPasswordReset(email, {
    getUserByEmail,
    createPasswordResetToken,
    sendResetEmail: async (to, rawToken) => {
      // Token cru É a informação, mesmo raciocínio do link de convite —
      // única forma de testar sem conta Resend criada (pendência).
      logger.info("link de reset de senha", { email: to, link: `/reset-password/${rawToken}` });
      await sendEmail({
        to,
        subject: "Redefinir senha — Parciva",
        html: `<p>Alguém pediu para redefinir a senha desta conta.</p><p><a href="${appBaseUrl()}/reset-password/${rawToken}">Redefinir senha</a></p><p>Se não foi você, ignore este e-mail.</p>`,
      });
    },
  });

  return NextResponse.json({ ok: true }, { status: 200 });
}
