# ADR-0012: `payments.origin` é cidadã de primeira classe desde a Fase 1

**Status:** Aceito
**Data:** Agosto 2026 (spec v1.0 §5.2)

## Contexto

O modelo B (cobrança PIX própria, webhook do PSP) só chega na Fase 6,
mas se o campo que distingue a origem de um pagamento for adicionado
depois, todo código escrito antes assume implicitamente "todo
pagamento vem de comprovante" — e a Fase 6 vira reescrita em vez de
adição.

## Decisão

`payments.origin` existe no schema desde a fundação, com valores
previstos além de `receipt` (`manual`, `psp_webhook`, `statement`,
`api`) ainda que só `receipt`/`manual` fossem usados na Fase 1.
CLAUDE.md invariante 9: "todo pagamento sabe se veio de comprovante
(modelo A) ou de webhook do PSP (modelo B). O motor de alocação é
compartilhado; o que muda é o caminho até ele" — `applyAllocationTx`
(`reconciliation/infra/payment-repository.ts`) é o núcleo único
compartilhado por toda origem; cada origem só monta os parâmetros
diferentes (`origin`, `verificationLevel`, ator).

## Alternativas consideradas

- **Adicionar o campo só quando o modelo B chegar** — rejeitado pela
  spec desde o início; é exatamente o tipo de retrofit caro que o
  projeto tenta evitar (mesmo raciocínio do ADR-0001 para RLS).

## Consequências

Quando a conciliação por extrato (Fase 5) precisou de um `origin:
"statement"`, o valor já existia no enum — só faltava alguém
escrevendo nele (DECISIONS.md [32]). O mesmo se repetirá quando o
modelo B (Fase 6) chegar: `origin: "psp_webhook"` e uma nova função
`execute*Payment` reusando `applyAllocationTx`, não uma reescrita do
motor. Ver ADR-0013 para `verification_level`, o campo irmão que
acompanha `origin` em todo pagamento.
