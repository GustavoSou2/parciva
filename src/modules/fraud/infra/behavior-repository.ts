/**
 * Agregados brutos pra Camada C (comportamento) — spec §8.1,
 * DECISIONS.md [35]. Só busca contagens/médias, nunca decide nada (a
 * decisão fica em `fraud/domain/behavior.ts`). Mesmo padrão de
 * `fraud-check-repository.ts`: recebe `db: TenantDb` já aberto pela
 * transação de `reconciliation/infra/payment-repository.ts`.
 */

import { and, avg, count, countDistinct, eq, gte, lt, min, ne } from "drizzle-orm";
import type { TenantDb } from "@/db/client";
import { contracts, installments, payments } from "@/db/schema/financial";
import { money, type Money } from "@/shared/money";
import type { PayerActivityCounts } from "../domain/behavior";

/** Divide o histórico do pagador em janela recente × anterior, pro cálculo de taxa diária em `detectVelocityAnomaly`. */
export async function getPayerActivityCounts(
  db: TenantDb,
  tenantId: string,
  payerId: string,
  windowStart: Date,
): Promise<PayerActivityCounts> {
  const [recent] = await db
    .select({ value: count() })
    .from(payments)
    .where(
      and(
        eq(payments.tenantId, tenantId),
        eq(payments.payerId, payerId),
        eq(payments.status, "applied"),
        gte(payments.createdAt, windowStart),
      ),
    );

  const [prior] = await db
    .select({ value: count(), firstAcceptedAt: min(payments.createdAt) })
    .from(payments)
    .where(
      and(
        eq(payments.tenantId, tenantId),
        eq(payments.payerId, payerId),
        eq(payments.status, "applied"),
        lt(payments.createdAt, windowStart),
      ),
    );

  return {
    recentAcceptedCount: recent?.value ?? 0,
    priorAcceptedCount: prior?.value ?? 0,
    firstAcceptedAt: prior?.firstAcceptedAt ?? null,
  };
}

/** Média entre TODOS os contratos do pagador — `null` se ele não tiver nenhuma parcela ainda (sem baseline). */
export async function getPayerAverageInstallmentCents(
  db: TenantDb,
  tenantId: string,
  payerId: string,
): Promise<Money | null> {
  const [row] = await db
    .select({ value: avg(installments.amountCents) })
    .from(installments)
    .innerJoin(contracts, eq(installments.contractId, contracts.id))
    .where(and(eq(installments.tenantId, tenantId), eq(contracts.payerId, payerId)));

  if (!row?.value) return null;
  return money(Math.round(Number(row.value)));
}

/** Quantos pagadores DIFERENTES (excluindo o próprio) tiveram pagamento aceito com o mesmo valor exato na janela — sinal de `AMOUNT_PATTERN`, distinto de `e2e_reuse`. */
export async function countDistinctPayersWithAmountRecently(
  db: TenantDb,
  tenantId: string,
  amountCents: Money,
  excludePayerId: string,
  since: Date,
): Promise<number> {
  const [row] = await db
    .select({ value: countDistinct(payments.payerId) })
    .from(payments)
    .where(
      and(
        eq(payments.tenantId, tenantId),
        eq(payments.status, "applied"),
        eq(payments.amountCents, amountCents),
        ne(payments.payerId, excludePayerId),
        gte(payments.createdAt, since),
      ),
    );
  return row?.value ?? 0;
}
