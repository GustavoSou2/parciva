/**
 * Seed mínimo e idempotente — `pnpm db:seed` (já referenciado em
 * package.json, faltava o arquivo). Sem isso não há tenant/canal para o
 * webhook do WhatsApp resolver (spec §5.4) nem plano para associar.
 *
 * Conexão própria (mesmo padrão de `migrate.ts`): script roda fora de
 * qualquer TenantContext, então insere direto nas tabelas raiz (`plans`,
 * `tenants`, `users`, `whatsapp_channels`, sem RLS). `memberships` é
 * diferente — tem `FORCE ROW LEVEL SECURITY` (0001_rls.sql) e bloqueia
 * até o dono da tabela sem `app.tenant_id` setado; por isso esse insert
 * roda dentro de uma transação com `SET LOCAL`, no mesmo padrão de
 * `getDb()` (src/db/client.ts) — não dá para usar `getDb()` direto aqui
 * porque ele exige um `TenantContext` já resolvido e este script é
 * quem está criando o tenant.
 */

import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, sql as rawSql } from "drizzle-orm";
import { memberships, plans, tenants, users } from "./schema/tenancy";
import { whatsappChannels } from "./schema/ingestion";
import { PLAN_LIMITS } from "@/modules/billing";
import { generateSlug } from "@/modules/tenant";

const DEV_TENANT_NAME = "Tenant de desenvolvimento";
const DEV_OWNER_EMAIL = "dev@parciva.local";
const DEV_OWNER_NAME = "Owner de desenvolvimento";

// Placeholder de dev — não é decisão de precificação (spec §11.1 não define valores).
const PLAN_PRICE_CENTS_PLACEHOLDER: Record<string, number> = {
  free: 0,
  essential: 9900,
  professional: 24900,
  scale: 0, // "sob medida" — negociado manualmente, sem preço de tabela
};

async function main(): Promise<void> {
  const connectionString =
    process.env.DATABASE_URL ?? "postgresql://parciva:parciva@localhost:5432/parciva_dev";
  const sql = postgres(connectionString, { max: 1 });
  const db = drizzle(sql);

  try {
    for (const [code, limits] of Object.entries(PLAN_LIMITS)) {
      await db
        .insert(plans)
        .values({
          code,
          name: code.charAt(0).toUpperCase() + code.slice(1),
          priceCents: PLAN_PRICE_CENTS_PLACEHOLDER[code] ?? 0,
          limits,
          features: {
            apiAccess: limits.apiAccess,
            webhooks: limits.webhooks,
            premiumExtraction: limits.premiumExtraction,
            pixCharges: limits.pixCharges,
          },
        })
        .onConflictDoNothing({ target: plans.code });
    }
    console.log(`[seed] ${Object.keys(PLAN_LIMITS).length} planos garantidos.`);

    const [freePlan] = await db.select({ id: plans.id }).from(plans).where(eq(plans.code, "free"));
    if (!freePlan) throw new Error("Plano 'free' não encontrado após seed — não deveria acontecer.");

    const tenantSlug = generateSlug(DEV_TENANT_NAME);
    await db
      .insert(tenants)
      .values({ name: DEV_TENANT_NAME, slug: tenantSlug, status: "trial", planId: freePlan.id })
      .onConflictDoNothing({ target: tenants.slug });
    const [tenant] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, tenantSlug));
    if (!tenant) throw new Error("Tenant de dev não encontrado após seed — não deveria acontecer.");
    console.log(`[seed] tenant '${tenantSlug}' (${tenant.id}) garantido.`);

    await db
      .insert(users)
      .values({ email: DEV_OWNER_EMAIL, name: DEV_OWNER_NAME })
      .onConflictDoNothing({ target: users.email });
    const [owner] = await db.select({ id: users.id }).from(users).where(eq(users.email, DEV_OWNER_EMAIL));
    if (!owner) throw new Error("Owner de dev não encontrado após seed — não deveria acontecer.");

    // `memberships` tem FORCE ROW LEVEL SECURITY — precisa de
    // `app.tenant_id` setado na transação (mesmo mecanismo de getDb()).
    await db.transaction(async (tx) => {
      await tx.execute(rawSql`select set_config('app.tenant_id', ${tenant.id}, true)`);
      await tx
        .insert(memberships)
        .values({ tenantId: tenant.id, userId: owner.id, role: "owner", acceptedAt: new Date() })
        .onConflictDoNothing({ target: [memberships.tenantId, memberships.userId] });
    });
    console.log(`[seed] owner '${DEV_OWNER_EMAIL}' garantido no tenant.`);

    const fromNumber = process.env.TWILIO_WHATSAPP_FROM;
    if (!fromNumber) {
      console.warn(
        "[seed] TWILIO_WHATSAPP_FROM não configurado — nenhum whatsapp_channels criado; " +
          "o webhook não vai resolver tenant para nenhum número até isso ser configurado e o seed rodar de novo.",
      );
    } else {
      await db
        .insert(whatsappChannels)
        .values({
          tenantId: tenant.id,
          provider: "twilio",
          phoneNumberId: fromNumber,
          displayNumber: fromNumber,
          status: "active",
          verifiedAt: new Date(),
        })
        .onConflictDoNothing({ target: whatsappChannels.phoneNumberId });
      console.log(`[seed] whatsapp_channels para '${fromNumber}' garantido.`);
    }
  } finally {
    await sql.end();
  }
}

main().catch((error: unknown) => {
  console.error("Falha ao rodar seed:", error);
  process.exitCode = 1;
});
