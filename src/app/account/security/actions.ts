"use server";

/**
 * MFA da própria conta — sem `TenantContext`/RBAC de tenant, porque
 * MFA é propriedade do usuário, não de um tenant (`requireGlobalSession`,
 * não `requireTenantSession`). `startEnrollmentAction`/
 * `confirmEnrollmentAction` são chamadas diretamente por um componente
 * cliente (não `<form action={}>`) — devolvem dado pra renderizar
 * (QR/segredo/códigos de recuperação), diferente do resto do projeto
 * (decisão [16]: formulário simples usa Server Action com redirect;
 * aqui há interatividade de verdade — mostrar QR, esperar confirmação,
 * revelar códigos uma única vez — que justifica a exceção).
 */

import QRCode from "qrcode";
import { redirect } from "next/navigation";
import { requireGlobalSession } from "@/app/_lib/require-global-session";
import { formString } from "@/app/_lib/form-data";
import {
  confirmMfaEnrollment,
  disableMfaWithPassword,
  enableMfa,
  getMfaState,
  getUserById,
  disableMfa,
  saveRecoveryCodes,
  setPendingMfaSecret,
  startMfaEnrollment,
} from "@/modules/identity";
import { isErr } from "@/shared/result";

export interface EnrollmentView {
  readonly secretBase32: string;
  readonly qrDataUrl: string;
}

export async function startEnrollmentAction(): Promise<EnrollmentView> {
  const user = await requireGlobalSession();
  const { secretBase32, otpauthUri } = await startMfaEnrollment(user.id, user.email, { setPendingMfaSecret });
  const qrDataUrl = await QRCode.toDataURL(otpauthUri);
  return { secretBase32, qrDataUrl };
}

export interface ConfirmEnrollmentView {
  readonly ok: boolean;
  readonly error?: string;
  readonly recoveryCodes?: readonly string[];
}

export async function confirmEnrollmentAction(code: string): Promise<ConfirmEnrollmentView> {
  const user = await requireGlobalSession();
  const result = await confirmMfaEnrollment(user.id, code, { getMfaState, enableMfa, saveRecoveryCodes });
  if (isErr(result)) return { ok: false, error: result.error };
  return { ok: true, recoveryCodes: result.value.recoveryCodes };
}

/** Formulário simples (senha → desativa → redireciona) — segue o padrão normal do projeto, sem interatividade extra. */
export async function disableMfaAction(formData: FormData): Promise<void> {
  const user = await requireGlobalSession();
  const password = formString(formData, "password");

  const result = await disableMfaWithPassword(user.id, password, { getUserById, disableMfa });
  if (isErr(result)) {
    redirect(`/account/security?error=${result.error}`);
  }
  redirect("/account/security");
}
