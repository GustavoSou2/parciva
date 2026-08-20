import { and, eq, ne } from "drizzle-orm";
import { getDb, type TenantContext } from "@/db/client";
import { payers } from "@/db/schema/financial";
import type { Payer, PayerStatus, ValidatedPayer } from "../domain/types";

function toPayer(row: typeof payers.$inferSelect): Payer {
  return {
    id: row.id,
    name: row.name,
    documentType: row.documentType,
    documentMasked: row.documentMasked,
    phoneE164: row.phoneE164,
    email: row.email,
    status: row.status,
    createdAt: row.createdAt,
  };
}

export async function documentHashExists(ctx: TenantContext, hash: string): Promise<boolean> {
  const rows = await getDb(ctx, (db) =>
    db
      .select({ id: payers.id })
      .from(payers)
      .where(and(eq(payers.tenantId, ctx.tenantId), eq(payers.documentHash, hash)))
      .limit(1),
  );
  return rows.length > 0;
}

export async function savePayer(
  ctx: TenantContext,
  data: ValidatedPayer & { documentHash: string | null },
): Promise<{ payerId: string }> {
  const [row] = await getDb(ctx, (db) =>
    db
      .insert(payers)
      .values({
        tenantId: ctx.tenantId,
        name: data.name,
        documentType: data.documentType,
        document: data.document,
        documentHash: data.documentHash,
        documentMasked: data.documentMasked,
        phoneE164: data.phoneE164,
        email: data.email,
      })
      .returning({ id: payers.id }),
  );
  if (!row) throw new Error("Insert de payer não retornou linha — não deveria acontecer.");
  return { payerId: row.id };
}

/** Mesma checagem de `documentHashExists`, excluindo o próprio pagador — editar sem trocar o documento não deveria "colidir com si mesmo". */
export async function documentHashExistsExcluding(
  ctx: TenantContext,
  hash: string,
  excludePayerId: string,
): Promise<boolean> {
  const rows = await getDb(ctx, (db) =>
    db
      .select({ id: payers.id })
      .from(payers)
      .where(
        and(
          eq(payers.tenantId, ctx.tenantId),
          eq(payers.documentHash, hash),
          ne(payers.id, excludePayerId),
        ),
      )
      .limit(1),
  );
  return rows.length > 0;
}

/** Nome "save*" de propósito (mesmo padrão de `savePayer`/`saveContractWithSchedule`/`saveTenant`) — infra sempre persiste, o verbo de domínio ("editar") fica no nome público de `application/update-payer.ts`. */
export async function savePayerUpdate(
  ctx: TenantContext,
  payerId: string,
  data: ValidatedPayer & { documentHash: string | null },
): Promise<void> {
  await getDb(ctx, (db) =>
    db
      .update(payers)
      .set({
        name: data.name,
        documentType: data.documentType,
        document: data.document,
        documentHash: data.documentHash,
        documentMasked: data.documentMasked,
        phoneE164: data.phoneE164,
        email: data.email,
        updatedAt: new Date(),
      })
      .where(and(eq(payers.tenantId, ctx.tenantId), eq(payers.id, payerId))),
  );
}

/** Nunca DELETE — desativar/reativar é a única forma de "remover" um pagador (mesmo espírito de `payments.status: "reversed"`). Sem cascata pra `contracts`: nada no código hoje lê `payers.status`. */
export async function setPayerStatus(
  ctx: TenantContext,
  payerId: string,
  status: PayerStatus,
): Promise<void> {
  await getDb(ctx, (db) =>
    db
      .update(payers)
      .set({ status, updatedAt: new Date() })
      .where(and(eq(payers.tenantId, ctx.tenantId), eq(payers.id, payerId))),
  );
}

export async function getPayerById(ctx: TenantContext, payerId: string): Promise<Payer | null> {
  const rows = await getDb(ctx, (db) =>
    db
      .select()
      .from(payers)
      .where(and(eq(payers.tenantId, ctx.tenantId), eq(payers.id, payerId)))
      .limit(1),
  );
  return rows[0] ? toPayer(rows[0]) : null;
}

export async function listPayers(ctx: TenantContext): Promise<Payer[]> {
  const rows = await getDb(ctx, (db) =>
    db.select().from(payers).where(eq(payers.tenantId, ctx.tenantId)),
  );
  return rows.map(toPayer);
}
