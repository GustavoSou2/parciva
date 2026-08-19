# ADR-0011: Parciva nunca custodia dinheiro

**Status:** Aceito — **decisão permanente**
**Data:** Agosto 2026 (spec v1.0 §1, §2.5)

## Contexto

A Fase 6 (modelo B) introduz cobrança PIX gerada pelo próprio Parciva.
Sem essa fronteira explícita, existe pressão comercial natural para
"seria tão mais fácil se vocês recebessem e repassassem" — o risco que
muda o regime jurídico do negócio para instituição de pagamento,
exigindo licença regulatória.

## Decisão

Parciva nunca é titular, intermediário nem custodiante do dinheiro, em
nenhuma hipótese. Quando a cobrança (modelo B) existir, o PIX é
emitido diretamente na conta do PSP do próprio tenant
(`psp_connections.account_ref` sempre do tenant, nunca do Parciva); o
recurso vai do pagador direto para a empresa. Não existe saque, split
ou repasse — nem na UI, nem implementado no código, mesmo que a API
de algum PSP ofereça a operação. CLAUDE.md invariante 8 registra: se
qualquer tarefa pedir retenção de valor, parar e avisar antes de
decidir sozinho.

## Alternativas consideradas

- **Custodiar valores e fazer split/repasse para o tenant** — rejeitado
  permanentemente. Mudaria o regime jurídico do negócio.

## Consequências

Decisão permanente — qualquer reavaliação exige assessoria regulatória
prévia, não decisão unilateral de engenharia. O schema já reflete essa
fronteira (`psp_connections`, `charges`, `charge_installments` criadas
vazias desde a fundação), mas nenhum módulo de aplicação para elas
existe ainda (`fraud`/`charges`/`psp` — só `fraud` passou a existir,
Fase 5; `charges`/`psp` seguem sem pasta, planejados para a Fase 6).
