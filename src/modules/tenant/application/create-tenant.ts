/**
 * Onboarding self-service — spec §4.3: todo tenant nasce em `trial`.
 * `sendWelcomeEmail` (passo 6) é best-effort: o tenant e o owner já
 * foram persistidos quando o e-mail é disparado, então uma falha ali
 * não desfaz o cadastro — só o e-mail de boas-vindas não sai.
 */

import type { Result } from "@/shared/result";
import { err, ok } from "@/shared/result";
import type { PlanLimits } from "@/modules/billing";
import type { MembershipRole } from "@/modules/identity";
import { generateSlug } from "../domain/slug";

const MAX_SLUG_SUFFIX_ATTEMPTS = 3;

export type NewTenant = {
  name: string;
  slug: string;
  status: "trial";
  planCode: string;
};

export type NewUser = {
  email: string;
  name: string;
};

export type CreateTenantInput = {
  name: string;
  ownerEmail: string;
  ownerName: string;
  planCode: string;
};

export interface CreateTenantDeps {
  slugExists(slug: string): Promise<boolean>;
  getPlanLimits(planCode: string): Promise<PlanLimits | null>;
  saveTenant(data: NewTenant): Promise<{ tenantId: string }>;
  saveUser(data: NewUser): Promise<{ userId: string }>;
  saveMembership(tenantId: string, userId: string, role: MembershipRole): Promise<void>;
  sendWelcomeEmail(email: string, name: string): Promise<void>;
}

export async function createTenant(
  input: CreateTenantInput,
  deps: CreateTenantDeps,
): Promise<
  Result<{ tenantId: string; slug: string }, "plan_not_found" | "slug_conflict" | "save_failed">
> {
  const limits = await deps.getPlanLimits(input.planCode);
  if (!limits) {
    return err("plan_not_found");
  }

  const baseSlug = generateSlug(input.name);
  let candidateSlug = baseSlug;
  let attempt = 0;
  while (await deps.slugExists(candidateSlug)) {
    attempt++;
    if (attempt > MAX_SLUG_SUFFIX_ATTEMPTS) {
      return err("slug_conflict");
    }
    candidateSlug = `${baseSlug}-${attempt + 1}`;
  }

  let tenantId: string;
  let userId: string;
  try {
    ({ tenantId } = await deps.saveTenant({
      name: input.name,
      slug: candidateSlug,
      status: "trial",
      planCode: input.planCode,
    }));
    ({ userId } = await deps.saveUser({ email: input.ownerEmail, name: input.ownerName }));
    await deps.saveMembership(tenantId, userId, "owner");
  } catch {
    return err("save_failed");
  }

  try {
    await deps.sendWelcomeEmail(input.ownerEmail, input.ownerName);
  } catch {
    // best-effort — falha no e-mail de boas-vindas não reverte o tenant.
  }

  return ok({ tenantId, slug: candidateSlug });
}
