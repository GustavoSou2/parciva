/**
 * Cancelamento pedido pelo dono (spec §14 Fase 4, DoD "cancelamento
 * testado") — efetiva no FIM do ciclo já pago, nunca imediatamente:
 * `subscriptions.cancel_at` (já no schema) é setado pra
 * `current_period_end`, o tenant continua `active` até lá. Sem
 * reembolso — PIX já pago não é revertido automaticamente.
 */

import type { Result } from "@/shared/result";
import { err, ok } from "@/shared/result";

export interface CancelSubscriptionDeps {
  getSubscriptionByTenant(tenantId: string): Promise<{ currentPeriodEnd: Date } | null>;
  scheduleSubscriptionCancellation(tenantId: string, cancelAt: Date): Promise<void>;
}

export type CancelSubscriptionError = "subscription_not_found";

export async function cancelSubscription(
  tenantId: string,
  deps: CancelSubscriptionDeps,
): Promise<Result<{ cancelAt: Date }, CancelSubscriptionError>> {
  const subscription = await deps.getSubscriptionByTenant(tenantId);
  if (!subscription) return err("subscription_not_found");

  await deps.scheduleSubscriptionCancellation(tenantId, subscription.currentPeriodEnd);
  return ok({ cancelAt: subscription.currentPeriodEnd });
}
