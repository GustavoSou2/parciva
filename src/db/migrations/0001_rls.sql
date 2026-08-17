-- RLS (Row Level Security) — spec §4.2, Camada 1 do isolamento
-- multi-tenant. Toda tabela de domínio com `tenant_id NOT NULL` recebe
-- a mesma policy: só enxerga/grava a linha cujo tenant_id bate com o
-- `app.tenant_id` da sessão (SET LOCAL, ver src/db/client.ts getDb()).
--
-- FORCE ROW LEVEL SECURITY é obrigatório aqui: sem ele, a policy não
-- se aplicaria ao role dono das tabelas (o mesmo role usado pela app
-- em dev/staging) — só a superusuários e não-donos. O superadmin
-- atravessa via role separado com BYPASSRLS (src/db/admin-client.ts),
-- nunca porque a policy foi omitida.
--
-- Fora da lista: `tenants` (é o próprio tenant, não tem coluna
-- tenant_id), `users` e `plans` (tabelas globais, compartilhadas entre
-- tenants — spec §5.1).

ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON memberships
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON subscriptions
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE usage_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_counters FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON usage_counters
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- audit_logs.tenant_id é nullable (ações globais do superadmin não têm
-- tenant, spec §12) — a policy só libera linha do tenant da sessão;
-- entradas globais (tenant_id NULL) só ficam visíveis via
-- getAdminDb() (BYPASSRLS), nunca pela sessão de um tenant.
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON audit_logs
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE payers ENABLE ROW LEVEL SECURITY;
ALTER TABLE payers FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON payers
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE contracts FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON contracts
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE installments ENABLE ROW LEVEL SECURITY;
ALTER TABLE installments FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON installments
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON payments
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE payment_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_allocations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON payment_allocations
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE credit_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_balances FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON credit_balances
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE psp_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE psp_connections FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON psp_connections
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE charges FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON charges
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE charge_installments ENABLE ROW LEVEL SECURITY;
ALTER TABLE charge_installments FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON charge_installments
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_entries FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON ledger_entries
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
