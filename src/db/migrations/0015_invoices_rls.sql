-- RLS para invoices (spec §13.2 tela 7, "faturas") — mesma convenção de
-- 0001_rls.sql/0004_ingestion_rls.sql/0008_reconciliation_proposals_rls.sql:
-- FORCE ROW LEVEL SECURITY + policy tenant_isolation. Tem tenant_id, não é
-- tabela raiz.

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON invoices
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
