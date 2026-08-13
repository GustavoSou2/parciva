/**
 * Limites de plano e cota — spec §11.1 (tabela de planos) e §11.3
 * (enforcement). `UsageStatus.warning`/`allowed` seguem a regra de
 * alerta em 80%/100% pedida em §11.2 para planos com excedente.
 */

export type PlanLimits = {
  receiptsPerMonth: number;
  activeContracts: number;
  users: number;
  whatsappNumbers: number;
  apiAccess: boolean;
  webhooks: boolean;
  retentionDays: number;
  premiumExtraction: boolean;
  pixCharges: boolean;
};

export type UsageMetric =
  | "receipts_per_month"
  | "active_contracts"
  | "users"
  | "whatsapp_numbers";

export type UsageStatus = {
  metric: UsageMetric;
  current: number;
  limit: number;
  pct: number;
  allowed: boolean;
  warning: boolean;
};
