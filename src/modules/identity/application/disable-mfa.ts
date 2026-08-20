/**
 * Desativar MFA exige a senha atual — nunca um toggle sem fricção
 * (critério de aceite da tarefa). Mesma verificação de senha do login
 * (`verifyPassword`).
 */

import { verifyPassword } from "@/shared/password";
import type { Result } from "@/shared/result";
import { err, ok } from "@/shared/result";

export interface DisableMfaDeps {
  getUserById(userId: string): Promise<{ passwordHash: string | null } | null>;
  disableMfa(userId: string): Promise<void>;
}

export type DisableMfaError = "invalid_password";

export async function disableMfaWithPassword(
  userId: string,
  currentPassword: string,
  deps: DisableMfaDeps,
): Promise<Result<void, DisableMfaError>> {
  const user = await deps.getUserById(userId);
  if (!user || !user.passwordHash) return err("invalid_password");

  const valid = await verifyPassword(user.passwordHash, currentPassword);
  if (!valid) return err("invalid_password");

  await deps.disableMfa(userId);
  return ok(undefined);
}
