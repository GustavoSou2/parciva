# ADR-0005: Rótulo "conferido" em vez de "confirmado" até haver conciliação por extrato

**Status:** Aceito
**Data:** Agosto 2026 (spec v1.0 §8.3)

## Contexto

Nas Fases 1–5 (modelo A), nenhuma baixa tem confirmação bancária real
— é sempre inferida de um documento ou, desde a Fase 5, de um extrato
importado. Usar a palavra "confirmado" na UI antes de haver confirmação
real do PSP é risco jurídico e destrói a confiança do cliente no
primeiro caso de fraude que passar.

## Decisão

Só o nível de verificação `psp_confirmed` (webhook real do PSP, modelo
B, Fase 6) autoriza a palavra "confirmado" — ver ADR-0013 para o
desenho completo de `verification_level`. Nas fases atuais, o rótulo
correto para um comprovante sem divergências é "Comprovante conferido
— sem divergências detectadas"; para um pagamento casado com extrato
importado (Fase 5), "Confirmado no extrato" já é honesto (o crédito
consta na conta), mas ainda não é "confirmado" pelo banco emissor do
pagador.

## Alternativas consideradas

- **Usar "confirmado" genericamente desde já** — mais simples para
  copy de produto, mas falso e juridicamente perigoso.
- **Esconder o nível de verificação do usuário final** — contraria a
  comunicação honesta que a spec exige como princípio de produto.

## Consequências

Toda tela e todo texto de produto que mencione um pagamento processado
por comprovante ou extrato precisa checar `verification_level` antes
de escolher a palavra. `StatusChip` (`src/ui/components/`) é o
componente central onde essa regra fica codificada — cada nível ganha
sua própria chave/rótulo, nunca reusa "Confirmado" fora de
`psp_confirmed` (ver decisão [19], `reviewed_approved` distinto de
`auto_applied`, mesmo cuidado).
