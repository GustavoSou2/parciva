"use server";

import { redirect } from "next/navigation";
import { requireTenantSession } from "@/app/_lib/require-tenant-session";
import { formString } from "@/app/_lib/form-data";
import {
  cancelContract,
  cancelContractTx,
  createContract,
  externalRefExists,
  externalRefExistsExcluding,
  getContractById,
  saveContractMetadata,
  saveContractWithSchedule,
  updateContract,
  type EarlyPaymentPolicy,
} from "@/modules/contracts";
import { registerManualPayment, executeManualPayment, reversePayment, executeReversal } from "@/modules/reconciliation";
import type { PaymentMethod } from "@/modules/reconciliation";
import { requirePermission } from "@/modules/identity";
import { fromReais, MoneyError } from "@/shared/money";
import { isErr } from "@/shared/result";

export async function createContractAction(tenantSlug: string, formData: FormData): Promise<void> {
  const session = await requireTenantSession(tenantSlug);
  if (isErr(requirePermission(session.role, "contracts:write"))) {
    redirect(`/t/${tenantSlug}/contracts/new?error=unauthorized`);
  }
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
  if (isErr(requirePermission(session.role, "payments:write"))) {
    redirect(`/t/${tenantSlug}/contracts/${contractId}?error=unauthorized`);
  }
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

  // `justConfirmed` — gatilho real de mudança de estado pro cartão da
  // parcela animar o check (CronogramaCards.tsx), nunca em visita normal.
  redirect(`/t/${tenantSlug}/contracts/${contractId}?justConfirmed=1`);
}

export async function reversePaymentAction(
  tenantSlug: string,
  contractId: string,
  paymentId: string,
): Promise<void> {
  const session = await requireTenantSession(tenantSlug);
  if (isErr(requirePermission(session.role, "payments:write"))) {
    redirect(`/t/${tenantSlug}/contracts/${contractId}?error=unauthorized`);
  }
  const ctx = { tenantId: session.tenantId };

  const result = await reversePayment(ctx, paymentId, session.userId, {
    executeReversal: (id, actor) => executeReversal(ctx, id, actor),
  });

  if (isErr(result)) {
    redirect(`/t/${tenantSlug}/contracts/${contractId}?error=${result.error}`);
  }

  redirect(`/t/${tenantSlug}/contracts/${contractId}`);
}

/** Editar contrato — só metadado (descrição/referência externa), decisão do usuário. */
export async function updateContractAction(
  tenantSlug: string,
  contractId: string,
  formData: FormData,
): Promise<void> {
  const session = await requireTenantSession(tenantSlug);
  if (isErr(requirePermission(session.role, "contracts:write"))) {
    redirect(`/t/${tenantSlug}/contracts/${contractId}/edit?error=unauthorized`);
  }
  const ctx = { tenantId: session.tenantId };

  const description = formString(formData, "description").trim() || undefined;
  const externalRef = formString(formData, "externalRef").trim() || undefined;

  const result = await updateContract(
    ctx,
    contractId,
    { ...(description ? { description } : {}), ...(externalRef ? { externalRef } : {}) },
    {
      externalRefExistsExcluding: (ref, excludeContractId) =>
        externalRefExistsExcluding(ctx, ref, excludeContractId),
      saveContractMetadata: (data) => saveContractMetadata(ctx, contractId, data),
    },
  );

  if (isErr(result)) {
    redirect(`/t/${tenantSlug}/contracts/${contractId}/edit?error=${result.error}`);
  }

  redirect(`/t/${tenantSlug}/contracts/${contractId}`);
}

/** Cancelar contrato — nunca DELETE (ver DECISIONS.md). Cancela também as parcelas ainda não pagas. */
export async function cancelContractAction(tenantSlug: string, contractId: string): Promise<void> {
  const session = await requireTenantSession(tenantSlug);
  if (isErr(requirePermission(session.role, "contracts:write"))) {
    redirect(`/t/${tenantSlug}/contracts/${contractId}?error=unauthorized`);
  }
  const ctx = { tenantId: session.tenantId };

  const result = await cancelContract(ctx, contractId, {
    getContractById: (id) => getContractById(ctx, id),
    cancelContractTx: (id) => cancelContractTx(ctx, id),
  });

  if (isErr(result)) {
    redirect(`/t/${tenantSlug}/contracts/${contractId}?error=${result.error}`);
  }

  redirect(`/t/${tenantSlug}/contracts/${contractId}`);
}
