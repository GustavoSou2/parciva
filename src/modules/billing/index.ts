// porta pública do módulo — só o que está aqui pode ser importado de fora.
export type { PlanLimits, UsageMetric, UsageStatus } from "./domain/types";
export { checkQuota, isFeatureEnabled, PLAN_LIMITS } from "./domain/quota";
export { validateAbacatePaySignature } from "./domain/abacatepay-signature";
export { enforceQuota } from "./application/enforce-quota";
export type { EnforceQuotaDeps } from "./application/enforce-quota";
export { getLimits, getCurrentUsage, incrementUsage } from "./infra/usage-repository";
export { createProduct, createCustomer, createCheckout } from "./infra/abacatepay-client";
export type { AbacatePayProduct, AbacatePayCustomer, AbacatePayCheckout } from "./infra/abacatepay-client";
export {
  getPlanByCode,
  getPlanById,
  saveAbacatePayProductId,
  getTenantBillingCustomerRef,
  saveTenantBillingCustomerRef,
  upsertSubscription,
  scheduleSubscriptionCancellation,
  markSubscriptionCancelled,
  markSubscriptionPastDue,
  getSubscriptionByTenant,
} from "./infra/subscription-repository";
export type { BillablePlan } from "./infra/subscription-repository";
export { subscribeTenant } from "./application/subscribe-tenant";
export type {
  SubscribeTenantInput,
  SubscribeTenantDeps,
  SubscribeTenantError,
} from "./application/subscribe-tenant";
export { handleBillingWebhook } from "./application/handle-billing-webhook";
export type {
  AbacatePayWebhookEvent,
  HandleBillingWebhookDeps,
  HandleBillingWebhookOutcome,
} from "./application/handle-billing-webhook";
export { cancelSubscription } from "./application/cancel-subscription";
export type { CancelSubscriptionDeps, CancelSubscriptionError } from "./application/cancel-subscription";
export { renewDueSubscriptions } from "./application/renew-subscriptions";
export type {
  RenewSubscriptionsDeps,
  RenewalOutcome,
  RenewalResult,
  SubscriptionDue,
} from "./application/renew-subscriptions";
