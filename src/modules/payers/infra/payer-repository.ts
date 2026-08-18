import { and, eq } from "drizzle-orm";
import { getDb, type TenantContext } from "@/db/client";
import { payers } from "@/db/schema/financial";
import type { Payer, ValidatedPayer } from "../domain/types";

function toPayer(row: typeof payers.$inferSelect): Payer {
  return {
    id: row.id,
    name: row.name,
    documentType: row.documentType,
    documentMasked: row.documentMasked,
    phoneE164: row.phoneE164,
    email: row.email,
    status: row.status,
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
