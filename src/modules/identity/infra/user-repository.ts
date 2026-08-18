/**
 * `users` é tabela raiz (sem `tenant_id`, fora da RLS — spec §5.1) —
 * sempre via `getRootDb()`, nunca `getDb(ctx, ...)`. Resolver quem é o
 * usuário a partir do e-mail é exatamente o problema de bootstrap:
 * ainda não existe `tenantId` nenhum no login.
 */

import { eq } from "drizzle-orm";
import { getRootDb } from "@/db/client";
import { users } from "@/db/schema/tenancy";

export interface UserRecord {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly passwordHash: string | null;
  readonly status: string;
}

function toUser(row: typeof users.$inferSelect): UserRecord {
  return { id: row.id, email: row.email, name: row.name, passwordHash: row.passwordHash, status: row.status };
}

export async function getUserByEmail(email: string): Promise<UserRecord | null> {
  const rows = await getRootDb().select().from(users).where(eq(users.email, email)).limit(1);
  return rows[0] ? toUser(rows[0]) : null;
}

export async function getUserById(userId: string): Promise<UserRecord | null> {
  const rows = await getRootDb().select().from(users).where(eq(users.id, userId)).limit(1);
  return rows[0] ? toUser(rows[0]) : null;
}

export interface NewUserRecord {
  readonly email: string;
  readonly name: string;
  readonly passwordHash?: string | null;
  readonly status?: string;
}

export async function createUser(data: NewUserRecord): Promise<{ userId: string }> {
  const [row] = await getRootDb()
    .insert(users)
    .values({
      email: data.email,
      name: data.name,
      passwordHash: data.passwordHash ?? null,
      status: data.status ?? "active",
    })
    .returning({ id: users.id });
  if (!row) throw new Error("Insert de user não retornou linha — não deveria acontecer.");
  return { userId: row.id };
}

export async function setPassword(userId: string, passwordHash: string): Promise<void> {
  await getRootDb().update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, userId));
}

export async function touchLastLogin(userId: string): Promise<void> {
  await getRootDb().update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, userId));
}
