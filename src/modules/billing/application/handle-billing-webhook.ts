/**
 * Processa evento de webhook da AbacatePay (spec §14 Fase 4). Nunca
 * decide status do tenant por conta própria — reaproveita a máquina
 * de estados de `tenant/domain/lifecycle.ts` (`payment_confirmed`/
 * `payment_failed`), já testada. `checkout.completed` é o único
 * evento confirmado empiricamente contra o ambiente de dev nesta
 * tarefa (criar uma cobrança real e checar a resposta) — os nomes de
 * evento para reembolso/disputa vêm só da documentação pública, sem
 * teste de webhook real (depende do segredo configurado no dashboard
 * da AbacatePay, fora do alcance desta tarefa).
 *
 * Além do status do tenant, também atualiza a linha de `invoices`
 * (`billing/infra/invoice-repository.ts`) que `subscribeTenant` grava
 * `pending` no momento do checkout — `checkout.completed → paid`,
 * `checkout.refunded → refunded`, `checkout.disputed → failed`.
 */

import type { Result } from "@/shared/result";
import { err, isErr, ok } from "@/shared/result";
import { transition, type TenantStatus, type TransitionEvent } from "@/modules/tenant";
import type { InvoiceStatus } from "../infra/invoice-repository";

export interface AbacatePayWebhookEvent {
  readonly event: string;
  readonly data: {
    readonly id: string;
    readonly status?: string;
    readonly metadata?: { readonly tenantId?: string; readonly planCode?: string } | null;
  };
}

export interface HandleBillingWebhookDeps {
  getTenantStatus(tenantId: string): Promise<TenantStatus | null>;
  setTenantStatus(tenantId: string, status: TenantStatus): Promise<void>;
  getPlanByCode(planCode: string): Promise<{ id: string } | null>;
  upsertSubscription(input: {
    tenantId: string;
    planId: string;
    providerRef: string;
    status: string;
    currentPeriodStart: Date;
    currentPeriodEnd: Date;
  }): Promise<void>;
  markInvoiceStatus(
    tenantId: string,
    providerRef: string,
    status: InvoiceStatus,
    paidAt?: Date | null,
  ): Promise<void>;
}

export type HandleBillingWebhookOutcome =
  | "processed"
  | "ignored_event"
  | "missing_metadata"
  | "tenant_not_found"
  | "plan_not_found"
  | "invalid_transition";

const EVENT_TO_TRANSITION: Partial<Record<string, TransitionEvent>> = {
  "checkout.completed": "payment_confirmed",
  "checkout.refunded": "payment_failed",
  "checkout.disputed": "payment_failed",
};

const EVENT_TO_INVOICE_STATUS: Partial<Record<string, InvoiceStatus>> = {
  "checkout.completed": "paid",
  "checkout.refunded": "refunded",
  "checkout.disputed": "failed",
};

/** Ciclo mensal — mesma cadência de `plans.interval` (hoje só "month" existe, spec §11.1). */
function nextPeriod(from: Date): Date {
  const end = new Date(from);
  end.setUTCMonth(end.getUTCMonth() + 1);
  return end;
}

export async function handleBillingWebhook(
  event: AbacatePayWebhookEvent,
  deps: HandleBillingWebhookDeps,
): Promise<Result<HandleBillingWebhookOutcome, HandleBillingWebhookOutcome>> {
  const transitionEvent = EVENT_TO_TRANSITION[event.event];
  if (!transitionEvent) return ok("ignored_event");

  const tenantId = event.data.metadata?.tenantId;
  const planCode = event.data.metadata?.planCode;
  if (!tenantId || !planCode) return err("missing_metadata");

  const currentStatus = await deps.getTenantStatus(tenantId);
  if (!currentStatus) return err("tenant_not_found");

  const transitionResult = transition(currentStatus, transitionEvent);
  if (isErr(transitionResult)) return err("invalid_transition");

  await deps.setTenantStatus(tenantId, transitionResult.value);

  const invoiceStatus = EVENT_TO_INVOICE_STATUS[event.event];
  if (invoiceStatus) {
    await deps.markInvoiceStatus(
      tenantId,
      event.data.id,
      invoiceStatus,
      invoiceStatus === "paid" ? new Date() : null,
    );
  }

  if (transitionEvent === "payment_confirmed") {
    const plan = await deps.getPlanByCode(planCode);
    if (!plan) return err("plan_not_found");

    const periodStart = new Date();
    await deps.upsertSubscription({
      tenantId,
      planId: plan.id,
      providerRef: event.data.id,
      status: "active",
      currentPeriodStart: periodStart,
      currentPeriodEnd: nextPeriod(periodStart),
    });
  }

  return ok("processed");
}
