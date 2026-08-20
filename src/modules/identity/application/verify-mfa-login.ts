/**
 * Segunda etapa do login com MFA ativo — recebe o challenge devolvido
 * por `login()` mais o código (TOTP de 6 dígitos OU código de
 * recuperação), e só então cria a sessão de verdade. Tenta TOTP
 * primeiro (caminho comum); código de recuperação é o fallback pra
 * quem perdeu o autenticador — cada um só funciona uma vez
 * (`consumeRecoveryCode`, atômico contra corrida).
 */

import type { Result } from "@/shared/result";
import { err, ok } from "@/shared/result";
import { decryptSecret } from "@/shared/crypto";
import { verifyMfaChallenge } from "../domain/mfa-challenge";
import { verifyTotpCode } from "../domain/totp";
import { normalizeRecoveryCode } from "../domain/recovery-codes";
import { hashToken } from "../domain/token";

export interface VerifyMfaLoginInput {
  readonly challengeToken: string;
  readonly code: string;
}

export interface VerifyMfaLoginDeps {
  mfaChallengeSecret: string;
  getMfaState(userId: string): Promise<{ mfaEnabled: boolean; mfaSecretRef: string | null } | null>;
  consumeRecoveryCode(userId: string, codeHash: string): Promise<boolean>;
  createSession(userId: string): Promise<{ rawToken: string; expiresAt: Date }>;
  touchLastLogin(userId: string): Promise<void>;
}

export type VerifyMfaLoginError = "invalid_or_expired_challenge" | "invalid_code";

export async function verifyMfaLogin(
  input: VerifyMfaLoginInput,
  deps: VerifyMfaLoginDeps,
): Promise<Result<{ userId: string; sessionToken: string; expiresAt: Date }, VerifyMfaLoginError>> {
  const userId = verifyMfaChallenge(input.challengeToken, deps.mfaChallengeSecret);
  if (!userId) return err("invalid_or_expired_challenge");

  const state = await deps.getMfaState(userId);
  if (!state || !state.mfaEnabled || !state.mfaSecretRef) return err("invalid_or_expired_challenge");

  const secret = Buffer.from(decryptSecret(state.mfaSecretRef), "base64");
  const totpValid = verifyTotpCode(secret, input.code);
  const recoveryValid =
    !totpValid && (await deps.consumeRecoveryCode(userId, hashToken(normalizeRecoveryCode(input.code))));

  if (!totpValid && !recoveryValid) return err("invalid_code");

  const session = await deps.createSession(userId);
  await deps.touchLastLogin(userId);

  return ok({ userId, sessionToken: session.rawToken, expiresAt: session.expiresAt });
}
