"use server";

import { redirect } from "next/navigation";
import { requireTenantSession } from "@/app/_lib/require-tenant-session";
import { formString } from "@/app/_lib/form-data";
import {
  createPayer,
  documentHashExistsExcluding,
  savePayer,
  savePayerUpdate,
  setPayerStatus,
  updatePayer,
  documentHashExists,
  type PayerStatus,
} from "@/modules/payers";
import { requirePermission } from "@/modules/identity";
import { isErr } from "@/shared/result";

/** `contracts:write` (não existe `payers:write` — spec bundla gestão de pagador com contrato sob Admin, ver DECISIONS.md). */
export async function createPayerAction(tenantSlug: string, formData: FormData): Promise<void> {
  const session = await requireTenantSession(tenantSlug);
  if (isErr(requirePermission(session.role, "contracts:write"))) {
    redirect(`/t/${tenantSlug}/payers/new?error=unauthorized`);
  }
  const ctx = { tenantId: session.tenantId };

  const name = formString(formData, "name");
  const document = formString(formData, "document").trim() || undefined;
  const phoneE164 = formString(formData, "phoneE164").trim() || undefined;

  const result = await createPayer(
    ctx,
    { name, ...(document ? { document } : {}), ...(phoneE164 ? { phoneE164 } : {}) },
    {
      documentHashPepper: process.env.DOCUMENT_HASH_PEPPER ?? "",
      documentHashExists: (hash) => documentHashExists(ctx, hash),
      savePayer: (data) => savePayer(ctx, data),
    },
  );

  if (isErr(result)) {
    // Formulário mínimo deste marco não tem exibição de erro inline
    // ainda (spec §13.2 UI polida é trabalho futuro) — redireciona de
    // volta pro formulário com o erro na query string.
    redirect(`/t/${tenantSlug}/payers/new?error=${result.error}`);
  }

  redirect(`/t/${tenantSlug}/payers/${result.value.payerId}`);
}

/** Editar cadastro — só metadado do próprio pagador, mesma permissão de criar (`contracts:write`, ver comentário acima). */
export async function updatePayerAction(
  tenantSlug: string,
  payerId: string,
  formData: FormData,
): Promise<void> {
  const session = await requireTenantSession(tenantSlug);
  if (isErr(requirePermission(session.role, "contracts:write"))) {
    redirect(`/t/${tenantSlug}/payers/${payerId}/edit?error=unauthorized`);
  }
  const ctx = { tenantId: session.tenantId };

  const name = formString(formData, "name");
  const document = formString(formData, "document").trim() || undefined;
  const phoneE164 = formString(formData, "phoneE164").trim() || undefined;

  const result = await updatePayer(
    ctx,
    payerId,
    { name, ...(document ? { document } : {}), ...(phoneE164 ? { phoneE164 } : {}) },
    {
      documentHashPepper: process.env.DOCUMENT_HASH_PEPPER ?? "",
      documentHashExistsExcluding: (hash, excludePayerId) =>
        documentHashExistsExcluding(ctx, hash, excludePayerId),
      savePayerUpdate: (data) => savePayerUpdate(ctx, payerId, data),
    },
  );

  if (isErr(result)) {
    redirect(`/t/${tenantSlug}/payers/${payerId}/edit?error=${result.error}`);
  }

  redirect(`/t/${tenantSlug}/payers/${payerId}`);
}

/** Desativar/reativar — nunca DELETE (ver DECISIONS.md). Toggle simples, sem validação de domínio — infra chamada direto, mesmo padrão de `updateReceiptStatus` em `review/actions.ts`. */
export async function setPayerStatusAction(
  tenantSlug: string,
  payerId: string,
  status: PayerStatus,
): Promise<void> {
  const session = await requireTenantSession(tenantSlug);
  if (isErr(requirePermission(session.role, "contracts:write"))) {
    redirect(`/t/${tenantSlug}/payers/${payerId}?error=unauthorized`);
  }
  const ctx = { tenantId: session.tenantId };

  await setPayerStatus(ctx, payerId, status);
  redirect(`/t/${tenantSlug}/payers/${payerId}`);
}
