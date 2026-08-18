/**
 * Geração/hash de token opaco de alta entropia — usado por sessão
 * (`session.ts`) e convite (`invite.ts`). O token bruto vive só no
 * lugar que o entrega (cookie, link de convite); o banco guarda sempre
 * o hash — mesmo raciocínio de `hashTransactionRef` em
 * `reconciliation/infra/payment-repository.ts`.
 */

import { createHash, randomBytes } from "node:crypto";

export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}
