-- RLS para statement_imports/statement_lines (Fase 5 fatia 2, spec §8.1
-- Camada D) — mesma convenção de 0001_rls.sql/0008/0015/0017: FORCE ROW
-- LEVEL SECURITY + policy tenant_isolation. Têm tenant_id, não são
-- tabelas raiz.

ALTER TABLE statement_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE statement_imports FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON statement_imports
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE statement_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE statement_lines FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON statement_lines
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
