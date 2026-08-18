-- Achado testando 0010: `current_setting('app.tenant_id', true)` pode
-- devolver STRING VAZIA, não NULL, dentro de uma transação que nunca
-- setou essa GUC (ex.: `getUserDb()`) — se uma conexão pooled já foi
-- usada por `getDb()` antes (que faz `SET LOCAL app.tenant_id = ...`),
-- o "reset" de uma GUC customizada ao fim da transação volta pro valor
-- placeholder ('' — não NULL) da primeira vez que ela foi referenciada
-- naquele backend, não pro "nunca setado". `''::uuid` sempre lança
-- (`invalid input syntax for type uuid`), derrubando a query inteira —
-- as duas policies de `memberships` são avaliadas juntas (OR entre
-- policies permissivas do mesmo comando), então isso quebrava tanto
-- `getUserDb()` (sem app.tenant_id) quanto `getDb()` numa conexão que
-- rodou `getUserDb()` antes (sem app.user_id).
--
-- `NULLIF(current_setting(...), '')` normaliza string vazia pra NULL
-- antes do cast — `tenant_id = NULL`/`user_id = NULL` é sempre falso
-- (nunca concede acesso), o comportamento seguro que já era esperado.
ALTER POLICY tenant_isolation ON memberships
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER POLICY self_membership_lookup ON memberships
  USING (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid);
