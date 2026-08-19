# ADR-0003: Dinheiro em centavos inteiros, sempre

**Status:** Aceito
**Data:** Agosto 2026 (spec v1.0 §3.3 e §7.4; implementado em `0bd9205`)

## Contexto

Erros de ponto flutuante em valores monetários (`0.1 + 0.2 !== 0.3`)
são inaceitáveis num sistema que decide se uma parcela foi quitada.

## Decisão

Todo valor monetário é um inteiro em centavos, nunca `float` nem
`decimal` em JS/TS. Implementado como branded type `Money` em
`src/shared/money.ts`: `type Money = number & { readonly [brand]:
"Money" }`, construído só via `money(cents)`, que lança `MoneyError`
se o valor não for inteiro finito. O tipo tem operações próprias
(`add`, `subtract`, `sum`, `min`, `max`, `isNegative`, `isZero`,
`fromReais`, `toDisplayReais`).

## Alternativas consideradas

- **`Decimal`/`BigNumber` de biblioteca externa** — overhead
  desnecessário quando centavos inteiros já resolvem.
- **`number` cru sem branding** — não impede erro de tipo; um `number`
  qualquer passaria por dinheiro sem validação.

## Consequências

O compilador recusa qualquer `number` não validado por `money()` em
contexto de dinheiro — a regra não depende de ninguém lembrar dela.
Toda extração de valor de comprovante também é forçada a produzir
inteiro em centavos, nunca formato ambíguo. Testado com propriedade
(fast-check), não só exemplo, por ser lógica fundamental de dinheiro
(CLAUDE.md, "regras de trabalho").
