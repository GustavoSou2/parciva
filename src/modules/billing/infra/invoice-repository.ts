/**
 * Histórico de cobrança (spec §13.2 tela 7, "faturas") — distinto de
 * `subscription-repository.ts`, que guarda só a linha "atual" da
 * assinatura. `invoices` TEM RLS de verdade (`0015_invoices_rls.sql`) —
 * sempre `getDb(ctx)`, nunca `getRootDb()`.
 */

import { and, desc, eq } from "drizzle-orm";
import { getDb, type TenantContext } from "@/db/client";
import { invoices } from "@/db/schema/tenancy";

export type InvoiceStatus = "pending" | "paid" | "failed" | "refunded";

export interface RecordInvoiceInput {
  readonly tenantId: string;
  readonly planCode: string;
  readonly providerRef: string;
  readonly amountCents: number;
  readonly status: InvoiceStatus;
}

/** Chamado por `subscribeTenant` só depois do checkout ter sido criado com sucesso — nunca antes (erro antes disso não gerou cobrança de verdade). */
export async function recordInvoice(input: RecordInvoiceInput): Promise<void> {
  const ctx: TenantContext = { tenantId: input.tenantId };
  await getDb(ctx, (db) =>
    db.insert(invoices).values({
      tenantId: input.tenantId,
      planCode: input.planCode,
      providerRef: input.providerRef,
      amountCents: input.amountCents,
      status: input.status,
    }),
  );
}

/** Chamado por `handleBillingWebhook` quando o evento da AbacatePay confirma/reembolsa/disputa uma cobrança. */
export async function markInvoiceStatus(
  tenantId: string,
  providerRef: string,
  status: InvoiceStatus,
  paidAt: Date | null = null,
): Promise<void> {
  const ctx: TenantContext = { tenantId };
  await getDb(ctx, (db) =>
    db
      .update(invoices)
      .set({ status, paidAt })
      .where(and(eq(invoices.tenantId, tenantId), eq(invoices.providerRef, providerRef))),
  );
}

export interface InvoiceSummary {
  readonly id: string;
  readonly planCode: string;
  readonly amountCents: number;
  readonly status: InvoiceStatus;
  readonly createdAt: Date;
  readonly paidAt: Date | null;
}

/** Usado por `/t/<slug>/account` — mais recente primeiro. */
export async function listInvoicesByTenant(tenantId: string): Promise<InvoiceSummary[]> {
  const ctx: TenantContext = { tenantId };
  return getDb(ctx, (db) =>
    db
      .select({
        id: invoices.id,
        planCode: invoices.planCode,
        amountCents: invoices.amountCents,
        status: invoices.status,
        createdAt: invoices.createdAt,
        paidAt: invoices.paidAt,
      })
      .from(invoices)
      .where(eq(invoices.tenantId, tenantId))
      .orderBy(desc(invoices.createdAt)),
  );
}
