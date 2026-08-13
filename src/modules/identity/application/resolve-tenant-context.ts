/**
 * Transforma sessão autenticada + slug de tenant em `TenantContext`
 * (spec §4.2, Camada 2: "repositórios recebem um TenantContext
 * obrigatório... não existe função de acesso a dados que aceite
 * ausência de tenant"). `deps.getMembership` é a única porta para
 * infra — este arquivo nunca importa `db` diretamente.
 *
 * `tenantSlug` vazio é rejeitado como `not_found` antes de qualquer
 * chamada a `deps` (não há tenant a resolver); `no_membership` cobre o
 * caso em que o tenant existe mas a sessão não tem vínculo com ele —
 * ambos retornam o mesmo formato de erro ao chamador HTTP (spec §4.2,
 * Camada 3: 404 em vez de 403, para não confirmar existência do
 * recurso a quem não tem acesso).
 */

import type { TenantContext } from "@/db/client";
import type { Result } from "@/shared/result";
import { err, ok } from "@/shared/result";
import type { MembershipRole } from "../domain/types";

export interface ResolveTenantContextDeps {
  getMembership(
    userId: string,
    tenantSlug: string,
  ): Promise<{ tenantId: string; role: MembershipRole } | null>;
}

export async function resolveTenantContext(
  sessionUserId: string,
  tenantSlug: string,
  deps: ResolveTenantContextDeps,
): Promise<Result<TenantContext & { role: MembershipRole }, "not_found" | "no_membership">> {
  if (!tenantSlug) {
    return err("not_found");
  }

  const membership = await deps.getMembership(sessionUserId, tenantSlug);
  if (!membership) {
    return err("no_membership");
  }

  return ok({ tenantId: membership.tenantId, role: membership.role });
}
