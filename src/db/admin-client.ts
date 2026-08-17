/**
 * Cliente do superadmin — spec §4.2 (Camada 2) e §12 ("acesso quebra-vidro
 * auditado"). Diferente de getDb(), NÃO recebe TenantContext e não aplica
 * `SET LOCAL app.tenant_id`: a conexão usa um role de banco separado, com
 * `BYPASSRLS` concedido explicitamente (nunca o mesmo role da aplicação),
 * para poder atravessar tenants — é exatamente por isso que o raio de
 * quem pode chamar esta função precisa ser mínimo.
 *
 * lint-disable-reason: este módulo só pode ser importado por
 * `src/app/(admin)/**` (o painel de administração, spec §12). Nenhum
 * `src/modules/**` deve importar admin-client.ts — um repositório de
 * domínio que enxergasse este cliente contornaria a RLS por engano, não
 * por decisão. Hoje essa restrição vive só neste comentário; a próxima
 * tarefa de lint deve promovê-la a uma regra `no-restricted-imports` em
 * eslintrc.json (fora do escopo desta tarefa, que se limita a
 * client.ts/admin-client.ts/migrate.ts).
 *
 * TODO(auditoria): toda chamada a getAdminDb() precisa gerar uma entrada
 * em `audit_logs` (ator, ação, tenant afetado, justificativa, janela de
 * acesso — spec §12). Este arquivo ainda não grava nada; a gravação real
 * entra numa tarefa futura, quando existir o repositório de audit_logs.
 */

import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

export type AdminDb = PostgresJsDatabase;

// Conexão base — nunca exportada. Só getAdminDb() a expõe.
const adminPool = postgres(
  process.env.ADMIN_DATABASE_URL ??
    process.env.DATABASE_URL ??
    "postgresql://parciva:parciva@localhost:5432/parciva_dev",
);

export function getAdminDb(): AdminDb {
  return drizzle(adminPool);
}
