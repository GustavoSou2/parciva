/**
 * Reset de senha — mesmo esqueleto de `invite.ts` (token opaco via
 * `token.ts`), sem `tenantId` (reset não é por tenant, é por usuário).
 * Expiração bem mais curta que convite (3 dias) ou sessão (7 dias):
 * link de reset parado é superfície de ataque, não conveniência.
 */

import { generateToken, hashToken } from "./token";

export const PASSWORD_RESET_DURATION_HOURS = 1;

export const generatePasswordResetToken = generateToken;
export const hashPasswordResetToken = hashToken;

export function passwordResetExpiresAt(from: Date = new Date()): Date {
  return new Date(from.getTime() + PASSWORD_RESET_DURATION_HOURS * 60 * 60 * 1000);
}
