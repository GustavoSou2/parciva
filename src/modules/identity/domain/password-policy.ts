/**
 * Política mínima de senha — spec §10.2. Só comprimento aqui:
 * "verificação contra listas de senhas vazadas" (§10.2) exigiria
 * integração com serviço externo (ex.: HaveIBeenPwned) — fora do
 * escopo deste marco, registrado como simplificação (PROGRESS.md).
 */

import type { Result } from "@/shared/result";
import { err, ok } from "@/shared/result";

const MIN_LENGTH = 8;

export type PasswordPolicyError = "too_short";

export function validatePassword(plain: string): Result<void, PasswordPolicyError> {
  if (plain.length < MIN_LENGTH) return err("too_short");
  return ok(undefined);
}
