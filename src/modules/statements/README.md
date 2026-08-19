# statements

Conciliação por extrato — Fase 5 (fatia 2, spec §8.1 Camada D, "o
melhor custo-benefício do projeto inteiro"): importa extrato bancário
em CSV, casa cada linha de crédito pelo E2E id extraído da descrição
contra um pagamento já existente (`origin: receipt`/`manual`) e sobe
`verification_level` pra `statement` ("O crédito consta na conta da
empresa").

**Match só por E2E ID.** Sem match por valor+data — ambíguo sem mais
contexto, e a spec descreve o mecanismo como "casa o E2E ID", não
aproximação. Linha sem E2E reconhecível ou sem pagamento
correspondente fica sem match — um humano pode escolher pagador/
contrato e registrar o pagamento a partir dela
(`createPaymentFromLine`), nunca automático.

**Não faz** (fora desta fatia, ver DECISIONS.md):
- **Só CSV.** OFX/CNAB ficam para uma fatia futura — sem dependência
  de parsing nova nesta (`domain/csv-parser.ts` é hand-rolled).
- **Sem sweep retroativo.** Um pagamento criado depois de um extrato já
  importado não é re-casado contra linhas antigas sem match, e
  re-importar um extrato não revarre linhas de outros imports.
- **UTF-8 assumido.** Banco que exporta em outra codificação (Latin-1)
  mostra acento quebrado — não corrigido.
- Perfil de risco/tolerância por tenant — mesma simplificação já usada
  em `fraud`/`billing` antes de virar setting configurável.
