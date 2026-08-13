/**
 * Caso de uso chamado antes de aceitar ingestão (spec §11.3: "checado
 * em dois pontos: no enqueue... e no worker" — este arquivo é chamado
 * nos dois pontos, com `deps` diferentes em cada). Nunca importa `db`
 * diretamente; `incrementUsage` deve persistir via
 * `INSERT ... ON CONFLICT DO UPDATE` transacional (spec §11.3) — não é
 * responsabilidade deste arquivo, só da infra que implementa `deps`.
 */

import type { TenantContext } from "@/db/client";
import type { Result } from "@/shared/result";
import { err, ok } from "@/shared/result";
import type { PlanLimits, UsageMetric } from "../domain/types";
import { checkQuota } from "../domain/quota";

export interface EnforceQuotaDeps {
  getLimits(tenantId: string): Promise<PlanLimits>;
  getCurrentUsage(tenantId: string, metric: UsageMetric): Promise<number>;
  incrementUsage(tenantId: string, metric: UsageMetric): Promise<void>;
}

export async function enforceQuota(
  ctx: TenantContext,
  metric: UsageMetric,
  deps: EnforceQuotaDeps,
): Promise<Result<void, "quota_exceeded" | "plan_not_found">> {
  let limits: PlanLimits;
  try {
    limits = await deps.getLimits(ctx.tenantId);
  } catch {
    return err("plan_not_found");
  }

  const current = await deps.getCurrentUsage(ctx.tenantId, metric);
  const status = checkQuota(metric, current, limits);
  if (!status.allowed) {
    return err("quota_exceeded");
  }

  await deps.incrementUsage(ctx.tenantId, metric);
  return ok(undefined);
}
