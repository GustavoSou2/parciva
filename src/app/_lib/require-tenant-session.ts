/**
 * Ponto único de resolução de sessão+tenant pras páginas/Server Actions
 * sob `src/app/t/[tenantSlug]/`. Fora de `src/modules/` de propósito —
 * usa `next/headers`/`next/navigation`, específicos do Next.js; os
 * módulos continuam framework-agnósticos (mesma separação de
 * `db/client.ts` vs. rotas).
 *
 * `cache()` do React deduplica dentro do mesmo request — layout e
 * página (e uma Server Action disparada a partir dela) podem chamar
 * isso sem repetir a consulta ao banco.
 */

import { cache } from "react";
import { cookies } from "next/headers";
import { notFound, unauthorized } from "next/navigation";
import {
  getMembership,
  getSessionByTokenHash,
  requireSession,
  resolveTenantContext,
  type MembershipRole,
} from "@/modules/identity";
import { isErr } from "@/shared/result";
import { SESSION_COOKIE_NAME } from "@/shared/session-cookie";

export interface TenantSession {
  readonly userId: string;
  readonly tenantId: string;
  readonly tenantSlug: string;
  readonly role: MembershipRole;
}

export const requireTenantSession = cache(async (tenantSlug: string): Promise<TenantSession> => {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  const sessionResult = await requireSession(token, { getSessionByTokenHash });
  if (isErr(sessionResult)) unauthorized();

  const tenantResult = await resolveTenantContext(sessionResult.value.userId, tenantSlug, {
    getMembership,
  });
  // 404, não 403 — mesma convenção documentada em
  // identity/application/resolve-tenant-context.ts: não confirmar a
  // existência do tenant a quem não tem acesso.
  if (isErr(tenantResult)) notFound();

  return {
    userId: sessionResult.value.userId,
    tenantId: tenantResult.value.tenantId,
    tenantSlug,
    role: tenantResult.value.role,
  };
});
