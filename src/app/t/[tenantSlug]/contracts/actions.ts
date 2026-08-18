"use server";

import { redirect } from "next/navigation";
import { requireTenantSession } from "@/app/_lib/require-tenant-session";
import { formString } from "@/app/_lib/form-data";
import {
  createContract,
  externalRefExists,
  saveContractWithSchedule,
  type EarlyPaymentPolicy,
} from "@/modules/contracts";
import { registerManualPayment, executeManualPayment, reversePayment, executeReversal } from "@/modules/reconciliation";
import type { PaymentMethod } from "@/modules/reconciliation";
import { fromReais, MoneyError } from "@/shared/money";
import { isErr } from "@/shared/result";

export async function createContractAction(tenantSlug: string, formData: FormData): Promise<void> {
  const session = await requireTenantSession(tenantSlug);
  const ctx = { tenantId: session.tenantId };

  const payerId = formString(formData, "payerId");
  const description = formString(formData, "description").trim() || undefined;
  const installmentsCount = Number(formData.get("installmentsCount") ?? 0);
  const startDate = formString(formData, "startDate");
  const earlyPaymentPolicy = (formString(formData, "earlyPaymentPolicy") ||
    "credit_balance") as EarlyPaymentPolicy;

  let principalCents;
  try {
    principalCents = fromReais(formString(formData, "principal") || "0");
  } catch (error) {
    const message = error instanceof MoneyError ? "invalid_amount" : "unknown_error";
    redirect(`/t/${tenantSlug}/contracts/new?error=${message}`);
  }

  const result = await createContract(
    ctx,
    {
      payerId,
      ...(description ? { description } : {}),
      principalCents,
      installmentsCount,
      startDate,
      earlyPaymentPolicy,
    },
    {
      externalRefExists: (ref) => externalRefExists(ctx, ref),
      saveContractWithSchedule: (input, schedule) => saveContractWithSchedule(ctx, input, schedule),
    },
  );

  if (isErr(result)) {
    redirect(`/t/${tenantSlug}/contracts/new?error=${result.error}`);
  }

  redirect(`/t/${tenantSlug}/contracts/${result.value.contractId}`);
}

export async function registerPaymentAction(
  tenantSlug: string,
  contractId: string,
  payerId: string,
  formData: FormData,
): Promise<void> {
  const session = await requireTenantSession(tenantSlug);
  const ctx = { tenantId: session.tenantId };

  let amountCents;
  try {
    amountCents = fromReais(formString(formData, "amount") || "0");
  } catch {
    redirect(`/t/${tenantSlug}/contracts/${contractId}?error=invalid_amount`);
  }

  const method = (formString(formData, "method") || "pix") as PaymentMethod;
  const transactionRef = formString(formData, "transactionRef").trim() || undefined;

  const result = await registerManualPayment(
    ctx,
    {
      payerId,
      contractId,
      amountCents,
      paidAt: new Date(),
      method,
      ...(transactionRef ? { transactionRef } : {}),
      actorUserId: session.userId,
    },
    { executePayment: (input) => executeManualPayment(ctx, input) },
  );

  if (isErr(result)) {
    redirect(`/t/${tenantSlug}/contracts/${contractId}?error=${result.error}`);
  }

  redirect(`/t/${tenantSlug}/contracts/${contractId}`);
}

export async function reversePaymentAction(
  tenantSlug: string,
  contractId: string,
  paymentId: string,
): Promise<void> {
  const session = await requireTenantSession(tenantSlug);
  const ctx = { tenantId: session.tenantId };

  const result = await reversePayment(ctx, paymentId, session.userId, {
    executeReversal: (id, actor) => executeReversal(ctx, id, actor),
  });

  if (isErr(result)) {
    redirect(`/t/${tenantSlug}/contracts/${contractId}?error=${result.error}`);
  }

  redirect(`/t/${tenantSlug}/contracts/${contractId}`);
}
