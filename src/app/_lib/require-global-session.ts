/**
 * Mesmo padrão de `require-tenant-session.ts`, mas sem resolver tenant
 * nenhum — pra páginas por USUÁRIO, não por tenant (ex.: `/account/
 * security`, MFA é propriedade da conta, não de uma empresa
 * específica: o mesmo usuário pode ser `owner` num tenant e `viewer`
 * noutro).
 */

import { cache } from "react";
import { cookies } from "next/headers";
import { unauthorized } from "next/navigation";
import { getUserById, getSessionByTokenHash, requireSession, type UserRecord } from "@/modules/identity";
import { isErr } from "@/shared/result";
import { SESSION_COOKIE_NAME } from "@/shared/session-cookie";

export const requireGlobalSession = cache(async (): Promise<UserRecord> => {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  const sessionResult = await requireSession(token, { getSessionByTokenHash });
  if (isErr(sessionResult)) unauthorized();

  const user = await getUserById(sessionResult.value.userId);
  if (!user) unauthorized();

  return user;
});
