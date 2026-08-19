/**
 * Cron de renovação (spec §14 Fase 4, pendência da decisão [25]) — a
 * AbacatePay não tem assinatura recorrente cobrada automaticamente
 * (achado empírico: `frequency: "SUBSCRIPTION"` é ignorado); é o
 * Parciva quem controla o calendário, gerando uma cobrança PIX nova a
 * cada ciclo via `subscribeTenant` (mesma função da primeira
 * assinatura — o cliente/produto na AbacatePay já existem sempre numa
 * renovação, por isso os campos de dono são opcionais nela).
 *
 * Duas guardas independentes contra reencaminhar a mesma cobrança em
 * dias seguintes: (1) a validade da transição `payment_failed` em
 * `tenants.status` (depois do primeiro dia, o tenant já está
 * `past_due`, e `past_due` não tem esse evento — ver `lifecycle.ts`);
 * (2) `markSubscriptionPastDue`, que também tira a assinatura do
 * filtro `status === "active"` usado para selecionar quem está
 * vencendo. Nenhuma das duas depende da outra — mesmo espírito de
 * defesa em profundidade da decisão [1].
 *
 * A cobrança só é criada ANTES de qualquer mudança de status — se a
 * chamada à AbacatePay falhar (rede, API fora), o tenant continua
 * exatamente como estava, sem punir o cliente por uma falha nossa.
 *
 * Dunning (decisão do usuário: 7 dias de tolerância) — `past_due` que
 * não voltou a `active` em `DUNNING_TOLERANCE_DAYS` é suspenso
 * automaticamente. Ancorado em `subscription.currentPeriodEnd`: nada
 * avança esse campo enquanto a assinatura está `past_due` (só o webhook,
 * ao confirmar pagamento, move pra frente via `nextPeriod()`), então ele
 * já é "desde quando está vencido" — não precisa de coluna nova. A
 * guarda contra suspender de novo em dias seguintes é a própria validade
 * da transição (`transition("suspended", "payment_overdue")` é inválida),
 * mesmo espírito de defesa em profundidade das duas guardas já descritas
 * acima para o caminho de renovação.
 */

import type { TenantStatus, TransitionEvent } from "@/modules/tenant";
import { transition } from "@/modules/tenant";
import type { Result } from "@/shared/result";
import { isErr } from "@/shared/result";
import type { SubscribeTenantError } from "./subscribe-tenant";

export interface SubscriptionDue {
  readonly planId: string;
  readonly status: string;
  readonly currentPeriodEnd: Date;
  readonly cancelAt: Date | null;
}

export interface RenewSubscriptionsDeps {
  listTenantIds(): Promise<string[]>;
  getSubscriptionByTenant(tenantId: string): Promise<SubscriptionDue | null>;
  getTenantStatus(tenantId: string): Promise<TenantStatus | null>;
  setTenantStatus(tenantId: string, status: TenantStatus): Promise<void>;
  markSubscriptionCancelled(tenantId: string): Promise<void>;
  markSubscriptionPastDue(tenantId: string): Promise<void>;
  getPlanById(planId: string): Promise<{ code: string } | null>;
  getTenantSlugById(tenantId: string): Promise<string | null>;
  createRenewalCheckout(input: {
    tenantId: string;
    planCode: string;
    returnUrl: string;
    completionUrl: string;
  }): Promise<Result<{ checkoutUrl: string }, SubscribeTenantError>>;
}

export type RenewalOutcome =
  | "cancelled"
  | "renewal_created"
  | "renewal_failed"
  | "suspended"
  | "skipped";

export interface RenewalResult {
  readonly tenantId: string;
  readonly outcome: RenewalOutcome;
}

const PAYMENT_FAILED: TransitionEvent = "payment_failed";
const CANCEL_REQUESTED: TransitionEvent = "cancel_requested";
const PAYMENT_OVERDUE: TransitionEvent = "payment_overdue";

/** Decisão do usuário (não da spec) — dias em `past_due` antes de suspender automaticamente. */
const DUNNING_TOLERANCE_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

async function finalizeCancellation(
  tenantId: string,
  tenantStatus: TenantStatus,
  deps: RenewSubscriptionsDeps,
): Promise<RenewalOutcome> {
  const result = transition(tenantStatus, CANCEL_REQUESTED);
  if (isErr(result)) return "skipped";

  await deps.setTenantStatus(tenantId, result.value);
  await deps.markSubscriptionCancelled(tenantId);
  return "cancelled";
}

async function renewCycle(
  tenantId: string,
  tenantStatus: TenantStatus,
  subscription: SubscriptionDue,
  appBaseUrl: string,
  deps: RenewSubscriptionsDeps,
): Promise<RenewalOutcome> {
  const transitionResult = transition(tenantStatus, PAYMENT_FAILED);
  if (isErr(transitionResult)) return "skipped";

  const [plan, tenantSlug] = await Promise.all([
    deps.getPlanById(subscription.planId),
    deps.getTenantSlugById(tenantId),
  ]);
  if (!plan || !tenantSlug) return "skipped";

  const accountUrl = `${appBaseUrl}/t/${tenantSlug}/account`;
  const checkout = await deps.createRenewalCheckout({
    tenantId,
    planCode: plan.code,
    returnUrl: accountUrl,
    completionUrl: accountUrl,
  });
  if (isErr(checkout)) return "renewal_failed";

  await deps.setTenantStatus(tenantId, transitionResult.value);
  await deps.markSubscriptionPastDue(tenantId);
  return "renewal_created";
}

/**
 * Suspensão automática por dunning — `past_due` há `DUNNING_TOLERANCE_
 * DAYS` dias ou mais vira `suspended`. `transition` é a guarda contra
 * repetir a suspensão em dias seguintes: uma vez `suspended`, o evento
 * não tem destino válido, então isto devolve `"skipped"` sem tocar em
 * nada.
 */
async function suspendIfOverdue(
  tenantId: string,
  tenantStatus: TenantStatus,
  subscription: SubscriptionDue,
  now: Date,
  deps: RenewSubscriptionsDeps,
): Promise<RenewalOutcome> {
  const overdueDays = (now.getTime() - subscription.currentPeriodEnd.getTime()) / MS_PER_DAY;
  if (overdueDays < DUNNING_TOLERANCE_DAYS) return "skipped";

  const transitionResult = transition(tenantStatus, PAYMENT_OVERDUE);
  if (isErr(transitionResult)) return "skipped";

  await deps.setTenantStatus(tenantId, transitionResult.value);
  return "suspended";
}

export async function renewDueSubscriptions(
  now: Date,
  appBaseUrl: string,
  deps: RenewSubscriptionsDeps,
): Promise<RenewalResult[]> {
  const tenantIds = await deps.listTenantIds();
  const results: RenewalResult[] = [];

  for (const tenantId of tenantIds) {
    const subscription = await deps.getSubscriptionByTenant(tenantId);
    if (!subscription) {
      results.push({ tenantId, outcome: "skipped" });
      continue;
    }

    const tenantStatus = await deps.getTenantStatus(tenantId);
    if (!tenantStatus) {
      results.push({ tenantId, outcome: "skipped" });
      continue;
    }

    let outcome: RenewalOutcome;
    if (subscription.cancelAt && subscription.cancelAt <= now) {
      // Também cobre cancelamento pedido enquanto já `past_due` — antes
      // desta mudança, esse caso nunca era revisitado pelo cron (o gate
      // original exigia `status === "active"`), então um pedido de
      // cancelamento feito durante `past_due` ficava preso pra sempre.
      outcome = await finalizeCancellation(tenantId, tenantStatus, deps);
    } else if (subscription.status === "active" && subscription.currentPeriodEnd <= now) {
      outcome = await renewCycle(tenantId, tenantStatus, subscription, appBaseUrl, deps);
    } else if (subscription.status === "past_due") {
      outcome = await suspendIfOverdue(tenantId, tenantStatus, subscription, now, deps);
    } else {
      outcome = "skipped";
    }

    results.push({ tenantId, outcome });
  }

  return results;
}
