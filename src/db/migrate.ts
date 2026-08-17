/**
 * Roda as migrações do Drizzle ao iniciar (pnpm db:migrate). Conexão
 * própria, isolada de client.ts/admin-client.ts: migração é DDL, roda
 * fora de qualquer TenantContext e precisa de conexão única — várias
 * conexões concorrentes rodando migração ao mesmo tempo é o cenário que
 * a doc do drizzle-orm pede para evitar (`max: 1`).
 *
 * ATENÇÃO: o migrator do Drizzle compara por timestamp, não por hash
 * de conteúdo. Migrações geradas com --custom e preenchidas depois
 * precisam ter as linhas correspondentes em drizzle.__drizzle_migrations
 * deletadas para serem reaplicadas em banco existente. Em banco novo
 * (produção, staging) isso não é problema — roda tudo do zero.
 */

import { fileURLToPath } from "node:url";
import path from "node:path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

const migrationsFolder = path.join(path.dirname(fileURLToPath(import.meta.url)), "migrations");

async function main(): Promise<void> {
  const connectionString =
    process.env.DATABASE_URL ?? "postgresql://parciva:parciva@localhost:5432/parciva_dev";
  const sql = postgres(connectionString, { max: 1 });
  const db = drizzle(sql);

  try {
    await migrate(db, { migrationsFolder });
  } finally {
    await sql.end();
  }
}

main().catch((error: unknown) => {
  console.error("Falha ao rodar migrações:", error);
  process.exitCode = 1;
});
