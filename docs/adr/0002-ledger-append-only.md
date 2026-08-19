# ADR-0002: Ledger append-only, correção por reversão

**Status:** Aceito
**Data:** Agosto 2026 (spec v1.0 §5.5; trigger em `0bd9205`)

## Contexto

O ledger é a fonte da verdade de todo o dinheiro do sistema. Precisa
ser auditável, reproduzível (mesma entrada + mesma versão de regra =
mesmo resultado) e resistente a correção silenciosa — inclusive por
quem tem acesso direto ao banco.

## Decisão

`ledger_entries` nunca recebe `UPDATE` nem `DELETE`. Toda correção é
um novo lançamento de reversão, referenciando o original via
`reverses_entry_id`. Protegido por trigger no banco
(`0002_ledger_trigger.sql`, função `forbid_ledger_mutation()`) — não
depende de disciplina do código de aplicação.

`direction: "credit"` reduz a dívida do contrato (pagamento aplicado);
`direction: "debit"` aumenta (reversão ou ajuste). `amount_cents` é
sempre a magnitude positiva do lançamento — o sinal do efeito vem só
de `direction`. `rule_version` grava a versão da regra de alocação que
gerou o lançamento, para permitir replay fiel.

## Alternativas consideradas

- **Confiar só na disciplina do código de aplicação** — rejeitado
  explicitamente (CLAUDE.md invariante 2: "não confie só na disciplina
  do código").
- **Soft-delete com flag de status** — não resolve o problema de
  correção silenciosa de valor.

## Consequências

Toda disputa de cliente ("baixaram errado há 6 meses") é resolvida por
replay do ledger, não por confiança na memória de alguém. Nenhum
código de aplicação pode assumir que pode "consertar" um lançamento —
precisa sempre modelar como reversão + novo lançamento.

A proteção foi confirmada na prática: uma tentativa de `DELETE` manual
para limpar dados de teste foi bloqueada pela trigger — comportamento
esperado, mesmo incomodando a limpeza de dev (ver DECISIONS.md [2],
nota de 18/08, e o mesmo padrão se repete em todo teste de isolamento
que usa o motor real desde então).
