# `early_payment_policy: "reduce_amount"`

**Módulo:** `src/modules/reconciliation/domain/allocation-engine.ts`
**Spec:** `docs/quitou-spec.md` §6.5 (políticas de adiantamento)
**Depende de:** motor de alocação (já existe, `allocatePayment`)

## Objetivo

Hoje `reduce_amount` cai em comportamento `credit_balance` (nunca
perde dinheiro, só não redistribui o cronograma futuro
automaticamente) — ver DECISIONS.md [14]. Implementar de verdade:
pagamento adiantado reduz o VALOR das parcelas futuras restantes
(mantém o número de parcelas), em vez de gerar crédito ou reduzir a
contagem.

Redistribuir `amount_cents` de parcelas futuras é reestruturação de
cronograma, não alocação de um pagamento — não cabe no formato atual
de `AllocationResult` (`reconciliation/domain/types.ts`) sem mudança
de forma.

## Critérios de aceite

- [ ] `AllocationResult` ganha a forma necessária pra expressar
      "reduzir valor de N parcelas futuras" sem confundir com os
      `installmentUpdates` de baixa normal
- [ ] Teste de propriedade: soma dos valores das parcelas restantes
      após `reduce_amount` é sempre igual ao saldo devedor original
      menos o valor adiantado
- [ ] Parcela cuja redução chegaria a zero ou negativo é tratada
      explicitamente (não é um caso silencioso)
- [ ] Compatível com o motor compartilhado — não duplica
      `allocatePayment`, estende

## Fora de escopo

Mudar o comportamento de `reduce_count` (já implementado e testado).
UI para o tenant escolher a política por contrato já existe
(formulário de criação) — não é objeto desta tarefa.
