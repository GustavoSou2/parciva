/**
 * `users.mfaEnabled`/`mfaSecretRef` e `mfa_recovery_codes` — ambas
 * tabelas raiz (ver comentário em `db/schema/tenancy.ts`), sempre via
 * `getRootDb()`, nunca `getDb(ctx, ...)`. MFA é propriedade do
 * usuário, não do tenant.
 */

import { and, eq, isNull } from "drizzle-orm";
import { getRootDb } from "@/db/client";
import { mfaRecoveryCodes, users } from "@/db/schema/tenancy";

export interface MfaState {
  readonly mfaEnabled: boolean;
  readonly mfaSecretRef: string | null;
}

export async function getMfaState(userId: string): Promise<MfaState | null> {
  const rows = await getRootDb()
    .select({ mfaEnabled: users.mfaEnabled, mfaSecretRef: users.mfaSecretRef })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return rows[0] ?? null;
}

/** Grava o segredo cifrado sem ativar MFA ainda — ativa só depois de `enableMfa`, quando o código de confirmação bater. */
export async function setPendingMfaSecret(userId: string, encryptedSecretRef: string): Promise<void> {
  await getRootDb()
    .update(users)
    .set({ mfaSecretRef: encryptedSecretRef, updatedAt: new Date() })
    .where(eq(users.id, userId));
}

export async function enableMfa(userId: string): Promise<void> {
  await getRootDb().update(users).set({ mfaEnabled: true, updatedAt: new Date() }).where(eq(users.id, userId));
}

/** Desativa e limpa tudo — segredo e códigos de recuperação, nunca deixa rastro reaproveitável. */
export async function disableMfa(userId: string): Promise<void> {
  await getRootDb().transaction(async (tx) => {
    await tx
      .update(users)
      .set({ mfaEnabled: false, mfaSecretRef: null, updatedAt: new Date() })
      .where(eq(users.id, userId));
    await tx.delete(mfaRecoveryCodes).where(eq(mfaRecoveryCodes.userId, userId));
  });
}

/** Substitui qualquer conjunto anterior — regenerar (via reativação) invalida os códigos antigos. */
export async function saveRecoveryCodes(userId: string, codeHashes: readonly string[]): Promise<void> {
  await getRootDb().transaction(async (tx) => {
    await tx.delete(mfaRecoveryCodes).where(eq(mfaRecoveryCodes.userId, userId));
    if (codeHashes.length === 0) return;
    await tx.insert(mfaRecoveryCodes).values(codeHashes.map((codeHash) => ({ userId, codeHash })));
  });
}

/** Atômico contra reuso em corrida (`used_at IS NULL` na própria condição do UPDATE) — devolve `true` só se consumiu uma linha de verdade. */
export async function consumeRecoveryCode(userId: string, codeHash: string): Promise<boolean> {
  const updated = await getRootDb()
    .update(mfaRecoveryCodes)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(mfaRecoveryCodes.userId, userId),
        eq(mfaRecoveryCodes.codeHash, codeHash),
        isNull(mfaRecoveryCodes.usedAt),
      ),
    )
    .returning({ id: mfaRecoveryCodes.id });
  return updated.length > 0;
}
