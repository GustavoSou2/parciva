-- RLS para as tabelas de ingestão/canal (spec §5.3/§5.4) — mesma
-- convenção de 0001_rls.sql: FORCE ROW LEVEL SECURITY + policy
-- tenant_isolation por tabela.
--
-- Fora da lista: `whatsapp_channels`. É tabela raiz, não tabela de
-- domínio — resolver o tenant a partir do número Twilio
-- (phone_number_id) precisa acontecer ANTES de existir um tenantId
-- para o SET LOCAL app.tenant_id (mesmo motivo que já tira
-- tenants/users/plans da RLS, ver 0001_rls.sql e
-- src/db/schema/ingestion.ts).

ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipts FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON receipts
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE receipt_extractions ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipt_extractions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON receipt_extractions
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE inbound_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE inbound_messages FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON inbound_messages
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
