-- RLS para fraud_checks (spec §5.2/§8) — mesma convenção de
-- 0001_rls.sql/0008_reconciliation_proposals_rls.sql/0015_invoices_rls.sql:
-- FORCE ROW LEVEL SECURITY + policy tenant_isolation. Tem tenant_id, não é
-- tabela raiz. `reconciliation_proposals.risk_score` (coluna nova nesta
-- mesma tarefa) não precisa de policy nova — a tabela já tem RLS desde
-- 0001_rls.sql.

ALTER TABLE fraud_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE fraud_checks FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON fraud_checks
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
