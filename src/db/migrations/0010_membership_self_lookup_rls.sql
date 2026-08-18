-- Segunda policy permissiva em `memberships`, só para SELECT — resolve
-- o problema de bootstrap "login não sabe pra qual tenant redirecionar"
-- sem bypassar RLS (getRootDb não bypassa; getAdminDb bypassa mas é
-- exclusivo do painel de superadmin — nenhum dos dois serve aqui).
--
-- Postgres faz OR entre policies permissivas do mesmo comando: uma
-- sessão com `app.user_id` setado (via `getUserDb`, antes de existir
-- `app.tenant_id`) passa a enxergar as PRÓPRIAS linhas de membership em
-- qualquer tenant, nunca a de outro usuário, nunca nenhuma outra
-- tabela. `FOR SELECT` é obrigatório aqui — sem ele, a mesma condição
-- valeria também para INSERT/UPDATE/DELETE, e um usuário conseguiria
-- criar membership pra si mesmo em qualquer tenant só sabendo o
-- próprio user_id, o que seria um buraco real de autorização.
CREATE POLICY self_membership_lookup ON memberships
  FOR SELECT
  USING (user_id = current_setting('app.user_id', true)::uuid);
