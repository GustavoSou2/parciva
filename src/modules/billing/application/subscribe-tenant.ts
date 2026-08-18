/**
 * Assinar/mudar de plano (spec §14 Fase 4) — garante produto (1 por
 * plano cobrado, reaproveitado sempre) e cliente (1 por tenant) na
 * AbacatePay, cria a cobrança PIX do ciclo atual, devolve a URL de
 * pagamento pro Server Action redirecionar o dono. Nunca decide
 * status do tenant aqui — isso só muda quando o webhook confirma o
 * pagamento (`handle-billing-webhook.ts`); esta função só inicia a
 * cobrança.
 *
 * Também é o motor do cron de renovação (`renew-subscriptions.ts`):
 * numa renovação, o cliente na AbacatePay já existe sempre (assinatura
 * anterior confirmada), então os campos de dono são opcionais — só são
 * exigidos quando `getTenantBillingCustomerRef` devolve nulo (primeira
 * assinatura de verdade, com dono real preenchendo o formulário).
 */

import type { Result } from "@/shared/result";
import { err, ok } from "@/shared/result";

export interface SubscribeTenantInput {
  readonly tenantId: string;
  readonly planCode: string;
  readonly ownerName?: string;
  readonly ownerEmail?: string;
  readonly ownerCellphone?: string;
  readonly ownerTaxId?: string;
  readonly returnUrl: string;
  readonly completionUrl: string;
}

export interface SubscribeTenantDeps {
  getPlanByCode(planCode: string): Promise<{ id: string; priceCents: number; abacatePayProductId: string | null } | null>;
  saveAbacatePayProductId(planCode: string, productId: string): Promise<void>;
  getTenantBillingCustomerRef(tenantId: string): Promise<string | null>;
  saveTenantBillingCustomerRef(tenantId: string, customerRef: string): Promise<void>;
  createProduct(input: { externalId: string; name: string; priceCents: number }): Promise<{ id: string }>;
  createCustomer(input: {
    name: string;
    email: string;
    cellphone: string;
    taxId: string;
  }): Promise<{ id: string }>;
  createCheckout(input: {
    productId: string;
    customerId: string;
    returnUrl: string;
    completionUrl: string;
    metadata?: Record<string, unknown>;
  }): Promise<{ id: string; url: string }>;
}

export type SubscribeTenantError = "plan_not_found" | "plan_not_billable" | "missing_owner_details";

export async function subscribeTenant(
  input: SubscribeTenantInput,
  deps: SubscribeTenantDeps,
): Promise<Result<{ checkoutUrl: string }, SubscribeTenantError>> {
  const plan = await deps.getPlanByCode(input.planCode);
  if (!plan) return err("plan_not_found");
  // `free` (0) nunca cobra; `scale` (também 0 hoje, "sob medida") segue
  // negociado manualmente — nenhum dos dois passa por checkout
  // automático (confirmado com o usuário).
  if (plan.priceCents <= 0) return err("plan_not_billable");

  let productId = plan.abacatePayProductId;
  if (!productId) {
    const product = await deps.createProduct({
      externalId: input.planCode,
      name: `Assinatura Parciva — ${input.planCode}`,
      priceCents: plan.priceCents,
    });
    productId = product.id;
    await deps.saveAbacatePayProductId(input.planCode, productId);
  }

  let customerRef = await deps.getTenantBillingCustomerRef(input.tenantId);
  if (!customerRef) {
    if (!input.ownerName || !input.ownerEmail || !input.ownerCellphone || !input.ownerTaxId) {
      return err("missing_owner_details");
    }
    const customer = await deps.createCustomer({
      name: input.ownerName,
      email: input.ownerEmail,
      cellphone: input.ownerCellphone,
      taxId: input.ownerTaxId,
    });
    customerRef = customer.id;
    await deps.saveTenantBillingCustomerRef(input.tenantId, customerRef);
  }

  const checkout = await deps.createCheckout({
    productId,
    customerId: customerRef,
    returnUrl: input.returnUrl,
    completionUrl: input.completionUrl,
    // Único jeito de o webhook (spec §14) saber a qual tenant/plano a
    // cobrança se refere — a AbacatePay ecoa `metadata` de volta no
    // próprio recurso (confirmado: a resposta de criação já devolve o
    // mesmo objeto que foi enviado).
    metadata: { tenantId: input.tenantId, planCode: input.planCode },
  });

  return ok({ checkoutUrl: checkout.url });
}
