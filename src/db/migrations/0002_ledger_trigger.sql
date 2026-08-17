
-- ledger_entries é append-only — CLAUDE.md invariante 2: nenhum
-- UPDATE, nenhum DELETE. Correção é lançamento de reversão
-- referenciando o original (reverses_entry_id, ver
-- src/db/schema/financial.ts). Este trigger é a defesa real no banco —
-- não confiar só na disciplina do código.

CREATE OR REPLACE FUNCTION forbid_ledger_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ledger_entries é append-only (tentativa de %)', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ledger_no_update
  BEFORE UPDATE OR DELETE ON ledger_entries
  FOR EACH ROW EXECUTE FUNCTION forbid_ledger_mutation();
