-- RLS para reconciliation_proposals (spec §5.3) — mesma convenção de
-- 0001_rls.sql/0004_ingestion_rls.sql: FORCE ROW LEVEL SECURITY +
-- policy tenant_isolation. Tem tenant_id, não é tabela raiz.

ALTER TABLE reconciliation_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE reconciliation_proposals FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON reconciliation_proposals
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
