"use server";

import { redirect } from "next/navigation";
import { requireTenantSession } from "@/app/_lib/require-tenant-session";
import { formString } from "@/app/_lib/form-data";
import { requirePermission, getUserById } from "@/modules/identity";
import {
  cancelSubscription,
  createCheckout,
  createCustomer,
  createProduct,
  getPlanByCode,
  getSubscriptionByTenant,
  getTenantBillingCustomerRef,
  saveAbacatePayProductId,
  saveTenantBillingCustomerRef,
  scheduleSubscriptionCancellation,
  subscribeTenant,
} from "@/modules/billing";
import { isValidDocument, normalizeDocument } from "@/shared/document";
import { isErr } from "@/shared/result";

function appBaseUrl(): string {
  const url = process.env.APP_BASE_URL;
  if (!url) {
    throw new Error("APP_BASE_URL não configurado.");
  }
  return url;
}

/**
 * Assinar/mudar de plano (spec §14 Fase 4, DoD "assinatura testada
 * até o checkout"). Telefone/CPF-CNPJ só são pedidos na primeira
 * assinatura — depois disso `tenants.billing_customer_ref` já existe
 * e `subscribeTenant` reaproveita o cliente na AbacatePay.
 */
export async function subscribeAction(
  tenantSlug: string,
  planCode: string,
  formData: FormData,
): Promise<void> {
  const session = await requireTenantSession(tenantSlug);
  if (isErr(requirePermission(session.role, "billing:write"))) {
    redirect(`/t/${tenantSlug}/account?error=unauthorized`);
  }

  const cellphone = formString(formData, "cellphone").trim();
  const taxIdRaw = formString(formData, "taxId").trim();

  const existingCustomerRef = await getTenantBillingCustomerRef(session.tenantId);
  if (!existingCustomerRef && (!cellphone || !isValidDocument(taxIdRaw))) {
    redirect(`/t/${tenantSlug}/account?error=invalid_billing_details`);
  }

  const user = await getUserById(session.userId);
  if (!user) {
    redirect(`/t/${tenantSlug}/account?error=not_found`);
  }

  const accountUrl = `${appBaseUrl()}/t/${tenantSlug}/account`;
  const result = await subscribeTenant(
    {
      tenantId: session.tenantId,
      planCode,
      ownerName: user.name,
      ownerEmail: user.email,
      ownerCellphone: cellphone,
      ownerTaxId: normalizeDocument(taxIdRaw),
      returnUrl: accountUrl,
      completionUrl: accountUrl,
    },
    {
      getPlanByCode,
      saveAbacatePayProductId,
      getTenantBillingCustomerRef,
      saveTenantBillingCustomerRef,
      createProduct,
      createCustomer,
      createCheckout,
    },
  );

  if (isErr(result)) {
    redirect(`/t/${tenantSlug}/account?error=${result.error}`);
  }

  redirect(result.value.checkoutUrl);
}

/** Cancelamento — efetiva no fim do ciclo já pago (`cancel-subscription.ts`), tenant continua ativo até lá. */
export async function cancelAction(tenantSlug: string): Promise<void> {
  const session = await requireTenantSession(tenantSlug);
  if (isErr(requirePermission(session.role, "billing:write"))) {
    redirect(`/t/${tenantSlug}/account?error=unauthorized`);
  }

  const result = await cancelSubscription(session.tenantId, {
    getSubscriptionByTenant,
    scheduleSubscriptionCancellation,
  });
  if (isErr(result)) {
    redirect(`/t/${tenantSlug}/account?error=${result.error}`);
  }

  redirect(`/t/${tenantSlug}/account`);
}
