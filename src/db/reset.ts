/**
 * `pnpm db:reset` (`tsx src/db/reset.ts && pnpm db:migrate && pnpm db:seed`)
 * — apaga todo dado de domínio pra recomeçar do zero em dev. Achado
 * faltando durante o Marco 6 (`package.json` já chamava este arquivo,
 * mas ele nunca existiu).
 *
 * `TRUNCATE ... CASCADE` em vez de `DROP SCHEMA`: preserva a estrutura
 * das tabelas (migrações continuam "aplicadas" em `drizzle.
 * __drizzle_migrations`, então `pnpm db:migrate` depois é no-op) e os
 * GRANTs de `parciva_app` feitos por `infra/init-db.sql` via `ALTER
 * DEFAULT PRIVILEGES` — um `DROP SCHEMA public CASCADE` recriaria o
 * schema com OID novo e perderia esses grants, reintroduzindo o
 * problema da decisão [13] por outro caminho.
 *
 * `TRUNCATE` não dispara trigger de linha (`BEFORE DELETE`), só
 * trigger de statement (`BEFORE TRUNCATE`) — a proteção append-only do
 * ledger (0002_ledger_trigger.sql) não impede isto. Isso é intencional
 * aqui: reset de dev existe exatamente pra destruir tudo e recomeçar,
 * nunca deveria rodar fora de localhost — por isso a checagem abaixo.
 */

import postgres from "postgres";

function assertLocalDatabase(connectionString: string): void {
  const isLocal = /(localhost|127\.0\.0\.1)/.test(connectionString);
  if (!isLocal) {
    throw new Error(
      "db:reset recusou rodar: DATABASE_URL não parece apontar para localhost. " +
        "Este script apaga TODO dado de domínio — não existe confirmação além desta checagem.",
    );
  }
}

async function main(): Promise<void> {
  const connectionString =
    process.env.DATABASE_URL ?? "postgresql://parciva:parciva@localhost:5432/parciva_dev";
  assertLocalDatabase(connectionString);

  const sql = postgres(connectionString, { max: 1 });
  try {
    const tables = await sql<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    `;
    if (tables.length === 0) {
      console.log("Nenhuma tabela em public — nada para limpar.");
      return;
    }

    const names = tables.map((t) => `"${t.tablename}"`).join(", ");
    await sql.unsafe(`TRUNCATE TABLE ${names} RESTART IDENTITY CASCADE`);
    console.log(`db:reset — ${tables.length} tabelas limpas (schema preservado).`);
  } finally {
    await sql.end();
  }
}

main().catch((error: unknown) => {
  console.error("Falha ao resetar o banco:", error);
  process.exitCode = 1;
});
