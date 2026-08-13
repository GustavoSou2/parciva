/**
 * Cota pura — sem I/O. Valores de `PLAN_LIMITS` vêm da tabela de
 * planos (spec §11.1). "ilimitado"/"sob medida" (professional/scale)
 * usam `Number.MAX_SAFE_INTEGER`, conforme pedido — não `Infinity`,
 * para manter `PlanLimits` serializável (JSONB, spec §5.1
 * `plans.limits`).
 */

import type { PlanLimits, UsageMetric, UsageStatus } from "./types";

const DIAS_5_ANOS = 365 * 5;

export const PLAN_LIMITS: Record<string, PlanLimits> = {
  free: {
    receiptsPerMonth: 30,
    activeContracts: 10,
    users: 1,
    whatsappNumbers: 1,
    apiAccess: false,
    webhooks: false,
    retentionDays: 90,
    premiumExtraction: false,
    pixCharges: false,
  },
  essential: {
    receiptsPerMonth: 300,
    activeContracts: 100,
    users: 3,
    whatsappNumbers: 1,
    apiAccess: false,
    webhooks: false,
    retentionDays: 365,
    premiumExtraction: true,
    pixCharges: true,
  },
  professional: {
    receiptsPerMonth: 1500,
    activeContracts: Number.MAX_SAFE_INTEGER,
    users: 10,
    whatsappNumbers: 3,
    apiAccess: true,
    webhooks: true,
    retentionDays: DIAS_5_ANOS,
    premiumExtraction: true,
    pixCharges: true,
  },
  scale: {
    receiptsPerMonth: Number.MAX_SAFE_INTEGER,
    activeContracts: Number.MAX_SAFE_INTEGER,
    users: Number.MAX_SAFE_INTEGER,
    whatsappNumbers: Number.MAX_SAFE_INTEGER,
    apiAccess: true,
    webhooks: true,
    retentionDays: Number.MAX_SAFE_INTEGER,
    premiumExtraction: true,
    pixCharges: true,
  },
};

const LIMIT_KEY_BY_METRIC: Record<UsageMetric, keyof PlanLimits> = {
  receipts_per_month: "receiptsPerMonth",
  active_contracts: "activeContracts",
  users: "users",
  whatsapp_numbers: "whatsappNumbers",
};

export function checkQuota(
  metric: UsageMetric,
  current: number,
  limits: PlanLimits,
): UsageStatus {
  const limit = limits[LIMIT_KEY_BY_METRIC[metric]] as number;
  const pct = (current / limit) * 100;

  return {
    metric,
    current,
    limit,
    pct,
    allowed: current < limit,
    warning: pct >= 80,
  };
}

export function isFeatureEnabled(
  feature: keyof Pick<PlanLimits, "apiAccess" | "webhooks" | "premiumExtraction" | "pixCharges">,
  limits: PlanLimits,
): boolean {
  return limits[feature];
}
