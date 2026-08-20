/**
 * Início da ativação de MFA — gera segredo TOTP novo, cifra
 * (`shared/crypto.ts`) e grava como PENDENTE (`mfaEnabled` continua
 * `false` até `confirm-mfa-enrollment.ts` confirmar com um código
 * válido). Chamar de novo antes de confirmar simplesmente sobrescreve
 * o segredo pendente anterior — nada fica "meio ativado".
 */

import { encryptSecret } from "@/shared/crypto";
import { base32Encode, buildOtpauthUri, generateTotpSecret } from "../domain/totp";

export interface StartMfaEnrollmentDeps {
  setPendingMfaSecret(userId: string, encryptedSecretRef: string): Promise<void>;
}

export interface StartMfaEnrollmentOutput {
  readonly secretBase32: string;
  readonly otpauthUri: string;
}

export async function startMfaEnrollment(
  userId: string,
  accountEmail: string,
  deps: StartMfaEnrollmentDeps,
): Promise<StartMfaEnrollmentOutput> {
  const secret = generateTotpSecret();
  await deps.setPendingMfaSecret(userId, encryptSecret(secret.toString("base64")));

  return {
    secretBase32: base32Encode(secret),
    otpauthUri: buildOtpauthUri(secret, accountEmail),
  };
}
