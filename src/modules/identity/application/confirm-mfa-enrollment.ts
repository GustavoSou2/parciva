/**
 * Confirma a ativação — o usuário prova que o app autenticador está
 * configurado corretamente digitando o código do momento. Só depois
 * disso `mfaEnabled` vira `true` e os códigos de recuperação existem
 * (mostrados em claro UMA VEZ na resposta — nunca recuperáveis depois,
 * nunca logados).
 */

import { decryptSecret } from "@/shared/crypto";
import type { Result } from "@/shared/result";
import { err, ok } from "@/shared/result";
import { verifyTotpCode } from "../domain/totp";
import { generateRecoveryCodes } from "../domain/recovery-codes";

export interface ConfirmMfaEnrollmentDeps {
  getMfaState(userId: string): Promise<{ mfaEnabled: boolean; mfaSecretRef: string | null } | null>;
  enableMfa(userId: string): Promise<void>;
  saveRecoveryCodes(userId: string, codeHashes: readonly string[]): Promise<void>;
}

export type ConfirmMfaEnrollmentError = "no_pending_enrollment" | "invalid_code";

export async function confirmMfaEnrollment(
  userId: string,
  code: string,
  deps: ConfirmMfaEnrollmentDeps,
): Promise<Result<{ recoveryCodes: readonly string[] }, ConfirmMfaEnrollmentError>> {
  const state = await deps.getMfaState(userId);
  if (!state || !state.mfaSecretRef || state.mfaEnabled) {
    return err("no_pending_enrollment");
  }

  const secret = Buffer.from(decryptSecret(state.mfaSecretRef), "base64");
  if (!verifyTotpCode(secret, code)) {
    return err("invalid_code");
  }

  const generated = generateRecoveryCodes();
  await deps.enableMfa(userId);
  await deps.saveRecoveryCodes(
    userId,
    generated.map((g) => g.codeHash),
  );

  return ok({ recoveryCodes: generated.map((g) => g.code) });
}
