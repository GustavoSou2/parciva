"use server";

import { redirect } from "next/navigation";
import { requireTenantSession } from "@/app/_lib/require-tenant-session";
import { formString } from "@/app/_lib/form-data";
import {
  createPaymentFromLine,
  importStatement,
  markStatementLineMatched,
  recordStatementImport,
} from "@/modules/statements";
import {
  executeStatementPayment,
  findPaymentByTransactionRef,
  upgradeVerificationLevelToStatement,
  type PaymentMethod,
} from "@/modules/reconciliation";
import { requirePermission } from "@/modules/identity";
import { fromReais } from "@/shared/money";
import { isErr } from "@/shared/result";

/**
 * Upload de extrato — `payments:write` (mesmo padrão de
 * `contracts/actions.ts`/`review/actions.ts`, decisões [30]/[31]).
 * `formString` devolve "" pra campo de arquivo de propósito
 * (`_lib/form-data.ts`) — extração do `File` é feita direto aqui, único
 * ponto que precisa disso.
 */
export async function uploadStatementAction(tenantSlug: string, formData: FormData): Promise<void> {
  const session = await requireTenantSession(tenantSlug);
  if (isErr(requirePermission(session.role, "payments:write"))) {
    redirect(`/t/${tenantSlug}/statements?error=unauthorized`);
  }
  const ctx = { tenantId: session.tenantId };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    redirect(`/t/${tenantSlug}/statements?error=missing_file`);
  }

  const rawCsv = await file.text();
  const result = await importStatement(
    { filename: file.name, uploadedBy: session.userId, rawCsv },
    {
      findPaymentByTransactionRef: (ref) => findPaymentByTransactionRef(ctx, ref),
      upgradeVerificationLevelToStatement: (paymentId) => upgradeVerificationLevelToStatement(ctx, paymentId),
      recordStatementImport: (input) => recordStatementImport(ctx, input),
    },
  );

  if (isErr(result)) {
    redirect(`/t/${tenantSlug}/statements?error=${result.error}`);
  }

  redirect(`/t/${tenantSlug}/statements/${result.value.importId}`);
}

/** Caminho manual — humano escolheu pagador/contrato pra uma linha sem match automático. */
export async function createPaymentFromLineAction(
  tenantSlug: string,
  importId: string,
  lineId: string,
  formData: FormData,
): Promise<void> {
  const session = await requireTenantSession(tenantSlug);
  if (isErr(requirePermission(session.role, "payments:write"))) {
    redirect(`/t/${tenantSlug}/statements/${importId}/lines/${lineId}?error=unauthorized`);
  }
  const ctx = { tenantId: session.tenantId };

  const payerId = formString(formData, "payerId");
  const contractId = formString(formData, "contractId");
  const method = (formString(formData, "method") || "pix") as PaymentMethod;
  const transactionRef = formString(formData, "transactionRef").trim() || undefined;
  const paidAtRaw = formString(formData, "paidAt");

  let amountCents;
  try {
    amountCents = fromReais(formString(formData, "amount") || "0");
  } catch {
    redirect(`/t/${tenantSlug}/statements/${importId}/lines/${lineId}?error=invalid_amount`);
  }

  const result = await createPaymentFromLine(
    lineId,
    {
      payerId,
      contractId,
      amountCents,
      paidAt: paidAtRaw ? new Date(paidAtRaw) : new Date(),
      method,
      ...(transactionRef ? { transactionRef } : {}),
      actorUserId: session.userId,
    },
    {
      executeStatementPayment: (input) => executeStatementPayment(ctx, input),
      markStatementLineMatched: (id, paymentId) => markStatementLineMatched(ctx, id, paymentId),
    },
  );

  if (isErr(result)) {
    redirect(`/t/${tenantSlug}/statements/${importId}/lines/${lineId}?error=${result.error}`);
  }

  redirect(`/t/${tenantSlug}/statements/${importId}`);
}
