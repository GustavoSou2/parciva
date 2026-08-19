# ADR-0013: `verification_level` como campo de produto

**Status:** Aceito
**Data:** Agosto 2026 (spec v1.0 §8.3)

## Contexto

Nem todo pagamento tem o mesmo grau de certeza — um lançamento manual,
um comprovante conferido, um crédito casado com extrato e uma
confirmação real do PSP são afirmações muito diferentes sobre "esse
dinheiro entrou de verdade". Tratar todos como equivalentes na UI
seria enganoso.

## Decisão

`payments.verification_level` é campo de produto, não só técnico, com
4 níveis e rótulo de UI correspondente definido por nível (ver
ADR-0005 para a aplicação da regra de rótulo):

| Nível | Origem | O que o sistema pode afirmar |
|---|---|---|
| `unverified` | lançamento manual | Alguém registrou este pagamento |
| `document` | comprovante (modelo A) | O documento não apresenta divergência |
| `statement` | casado com extrato importado (Fase 5) | O crédito consta na conta da empresa |
| `psp_confirmed` | webhook do PSP (modelo B, Fase 6) | O banco confirmou a transação |

O nível **sobe, nunca desce** — um pagamento registrado por
comprovante que depois aparece no extrato passa de `document` para
`statement` sem virar um segundo pagamento. Essa regra é garantida no
próprio SQL de quem faz o upgrade (`WHERE verification_level IN
(...)`), não por disciplina de quem chama.

## Alternativas consideradas

- **Não expor o nível na UI** — contraria a comunicação honesta
  exigida pela spec (ver ADR-0005).

## Consequências

Todo caminho novo que grava `payments` precisa decidir explicitamente
qual nível de verificação aquele pagamento merece — nunca um default
implícito. A conciliação por extrato (Fase 5) foi o primeiro código a
efetivamente subir um nível depois da criação do pagamento
(`upgradeVerificationLevelToStatement`, DECISIONS.md [32]); o modelo B
(Fase 6) será o segundo, subindo até `psp_confirmed`.
