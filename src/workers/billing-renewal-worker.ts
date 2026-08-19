/**
 * Worker BullMQ do cron de renovação de assinatura (spec §14 Fase 4,
 * decisão [25]) — a lógica de decisão vive em `billing/application/
 * renew-subscriptions.ts` (pura, testável sem banco); este arquivo só
 * monta as dependências de I/O reais e chama.
 */

import { Worker } from "bullmq";
import {
  createCheckout,
  createCustomer,
  createProduct,
  getPlanByCode,
  getPlanById,
  getSubscriptionByTenant,
  getTenantBillingCustomerRef,
  markSubscriptionCancelled,
  markSubscriptionPastDue,
  recordInvoice,
  renewDueSubscriptions,
  saveAbacatePayProductId,
  saveTenantBillingCustomerRef,
  subscribeTenant,
  type RenewSubscriptionsDeps,
} from "@/modules/billing";
import { getTenantSlugById, getTenantStatus, listTenantIds, setTenantStatus } from "@/modules/tenant";
import { logger } from "@/shared/logger";
import { BILLING_RENEWAL_QUEUE, type BillingRenewalJobData } from "./queues";

function redisUrl(): string {
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error("REDIS_URL não configurado.");
  }
  return url;
}

function appBaseUrl(): string {
  const url = process.env.APP_BASE_URL;
  if (!url) {
    throw new Error("APP_BASE_URL não configurado.");
  }
  return url;
}

function buildDeps(): RenewSubscriptionsDeps {
  return {
    listTenantIds,
    getSubscriptionByTenant,
    getTenantStatus,
    setTenantStatus,
    markSubscriptionCancelled,
    markSubscriptionPastDue,
    getPlanById,
    getTenantSlugById,
    // `subscribeTenant` é a mesma função da primeira assinatura — numa
    // renovação o cliente/produto já existem, então os campos de dono
    // (opcionais) nunca são passados aqui.
    createRenewalCheckout: (input) =>
      subscribeTenant(input, {
        getPlanByCode,
        saveAbacatePayProductId,
        getTenantBillingCustomerRef,
        saveTenantBillingCustomerRef,
        createProduct,
        createCustomer,
        createCheckout,
        recordInvoice,
      }),
  };
}

async function processBillingRenewalJob(): Promise<void> {
  logger.info("cron de renovação de assinatura: iniciando");
  const results = await renewDueSubscriptions(new Date(), appBaseUrl(), buildDeps());

  const summary = results.reduce<Record<string, number>>((acc, result) => {
    acc[result.outcome] = (acc[result.outcome] ?? 0) + 1;
    return acc;
  }, {});
  logger.info("cron de renovação de assinatura: concluído", { total: results.length, summary });

  for (const result of results) {
    if (result.outcome === "renewal_failed") {
      logger.error("renovação de assinatura falhou", { tenantId: result.tenantId });
    }
    if (result.outcome === "suspended") {
      logger.warn("tenant suspenso por dunning (past_due > 7 dias)", { tenantId: result.tenantId });
    }
  }
}

export const billingRenewalWorker = new Worker<BillingRenewalJobData>(
  BILLING_RENEWAL_QUEUE,
  processBillingRenewalJob,
  {
    connection: { url: redisUrl(), maxRetriesPerRequest: null },
    concurrency: 1,
  },
);

billingRenewalWorker.on("error", (error) => {
  logger.error("worker de renovação erro", { error });
});
billingRenewalWorker.on("ready", () => {
  logger.info("worker de renovação conectado ao Redis e pronto");
});
billingRenewalWorker.on("active", (job) => {
  logger.info("worker de renovação processando job", { jobId: job.id });
});
