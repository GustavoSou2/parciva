/**
 * Único ponto de acesso ao banco para código de domínio (CLAUDE.md,
 * invariante 3): "Toda query de domínio tem tenant_id. Acesso ao banco
 * só via db/client.ts, que exige TenantContext. Nunca cliente cru."
 *
 * RLS (spec §4.2, Camada 1) lê `current_setting('app.tenant_id', true)`.
 * Essa configuração só sobrevive dentro de uma transação quando definida
 * via SET LOCAL — fora de uma transação explícita, o Postgres descarta o
 * valor ao final do statement implícito. Por isso getDb() abre a
 * transação, aplica SET LOCAL (via set_config, para evitar concatenar o
 * tenantId na query) e só então entrega o cliente ao chamador — nunca
 * expõe um cliente "solto" sem essa garantia.
 */

import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";

export type TenantContext = { readonly tenantId: string };

// Conexão base — nunca exportada. Quem precisar de banco passa por getDb().
const pool = postgres(
  process.env.DATABASE_URL ?? "postgresql://parciva:parciva@localhost:5432/parciva_dev",
);
const baseDb = drizzle(pool);

// Extrai o tipo do parâmetro de transação de db.transaction(), em vez de
// importar o generic interno do drizzle-orm — evita acoplar este arquivo
// a um tipo que muda de nome entre versões da lib.
export type TenantDb = Parameters<Parameters<typeof baseDb.transaction>[0]>[0];

/**
 * Executa `run` dentro de uma transação com `app.tenant_id` fixado via
 * SET LOCAL, para que toda policy de RLS da transação veja o tenant
 * correto. Repositórios de módulo devem receber `TenantContext` no
 * construtor e chamar getDb() a cada operação — nunca guardar o `db`
 * resolvido fora do escopo de uma chamada.
 */
export async function getDb<T>(
  ctx: TenantContext,
  run: (db: TenantDb) => Promise<T>,
): Promise<T> {
  if (!ctx.tenantId) {
    throw new Error(
      "getDb() chamado sem tenantId — acesso ao banco sem TenantContext é proibido (invariante 3).",
    );
  }

  return baseDb.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.tenant_id', ${ctx.tenantId}, true)`);
    return run(tx);
  });
}
