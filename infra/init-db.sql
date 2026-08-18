-- Role de aplicação, distinto do POSTGRES_USER (superusuário — só para
-- migração/seed/admin, ver src/db/migrate.ts, src/db/seed.ts,
-- src/db/admin-client.ts). DECISIONS.md [1]/CLAUDE.md invariante 3: a
-- RLS só é defesa real se o role usado pelo runtime da aplicação NÃO
-- for superusuário nem tiver BYPASSRLS — superusuário ignora RLS
-- incondicionalmente, mesmo com FORCE ROW LEVEL SECURITY.
--
-- Rodado uma vez, na inicialização do volume do Postgres
-- (docker-entrypoint-initdb.d) — não roda de novo em volume já existente.
CREATE ROLE parciva_app LOGIN PASSWORD 'parciva_app' NOSUPERUSER NOBYPASSRLS;
GRANT CONNECT ON DATABASE parciva_dev TO parciva_app;
GRANT USAGE ON SCHEMA public TO parciva_app;

-- As tabelas de domínio ainda não existem neste momento (init roda antes
-- de `pnpm db:migrate`) — privilégio padrão aplica automaticamente a
-- toda tabela/sequência que o dono (parciva) criar depois, sem exigir
-- outro GRANT manual a cada `db:generate`.
ALTER DEFAULT PRIVILEGES FOR ROLE parciva IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO parciva_app;
ALTER DEFAULT PRIVILEGES FOR ROLE parciva IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO parciva_app;
