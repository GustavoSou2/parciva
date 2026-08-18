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
 *
 * Conecta via `APP_DATABASE_URL` (role `parciva_app`, ver
 * infra/init-db.sql), NUNCA `DATABASE_URL` (o role dono das tabelas,
 * usado só por migrate.ts/seed.ts/admin-client.ts) — de propósito, sem
 * fallback para `DATABASE_URL`. Superusuário ignora RLS
 * incondicionalmente, mesmo com FORCE ROW LEVEL SECURITY; um fallback
 * silencioso pro role dono reintroduziria exatamente o bug que este
 * comentário documenta. Isso foi um bug real, pego pelo primeiro teste
 * de isolamento cross-tenant (tests/security/tenant-isolation.test.ts)
 * rodando contra o Postgres do docker-compose, que até então só tinha
 * o role superusuário.
 */

import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";

export type TenantContext = { readonly tenantId: string };

// Conexão base — nunca exportada. Quem precisar de banco passa por getDb().
const pool = postgres(
  process.env.APP_DATABASE_URL ?? "postgresql://parciva_app:parciva_app@localhost:5432/parciva_dev",
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

/**
 * Acesso sem TenantContext — só para as tabelas raiz que nunca tiveram
 * RLS (`tenants`, `users`, `plans`, `whatsapp_channels`; ver comentário
 * em src/db/schema/tenancy.ts e src/db/schema/ingestion.ts). Existe para
 * o problema de bootstrap: resolver QUAL tenant antes de ter um
 * `tenantId` para passar a getDb() — ex.: achar o tenant a partir do
 * número Twilio do webhook. Diferente de getAdminDb() (admin-client.ts):
 * não bypassa RLS via role especial, porque essas tabelas nunca tiveram
 * policy — por isso é seguro para qualquer módulo de domínio chamar,
 * DESDE QUE só consulte essas tabelas raiz. Nunca use para tabela com
 * tenant_id — isso vazaria dado entre tenants sem passar pela RLS.
 * TODO(lint): promover essa restrição para `no-restricted-imports`
 * quando existir a tarefa de lint (mesmo TODO já registrado em
 * admin-client.ts para o caso irmão).
 */
export function getRootDb(): typeof baseDb {
  return baseDb;
}
