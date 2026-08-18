/**
 * Tipos do painel de superadmin — spec §12. Sem I/O. `status` segue o
 * ciclo de vida do tenant (spec §4.3); `planCode` referencia
 * `plans.code` (spec §5.1), não o id, para exibição direta.
 */

import type { Money } from "@/shared/money";

export type TenantSummary = {
  id: string;
  name: string;
  slug: string;
  status: "trial" | "active" | "past_due" | "suspended" | "cancelled" | "purged";
  planCode: string;
  receiptsThisMonth: number;
  aiCostThisMonthCents: Money;
  createdAt: Date;
};

export type GlobalMetrics = {
  activeTenants: number;
  receiptsToday: number;
  aiCostTodayCents: Money;
  reviewQueueSize: number;
};

export type AdminAction =
  | "suspend"
  | "reactivate"
  | "change_plan"
  | "grant_credit"
  | "impersonate";
