// porta pública do módulo — só o que está aqui pode ser importado de fora.
export type { PlanLimits, UsageMetric, UsageStatus } from "./domain/types";
export { checkQuota, isFeatureEnabled, PLAN_LIMITS } from "./domain/quota";
export { enforceQuota } from "./application/enforce-quota";
export type { EnforceQuotaDeps } from "./application/enforce-quota";
