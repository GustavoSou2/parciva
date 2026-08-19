# ADR-0007: Nenhum provedor de IA sem opt-out de treinamento em produção

**Status:** Aceito como princípio — **não exercido ainda em produção** (ver "Estado atual")
**Data:** Agosto 2026 (spec v1.0)

## Contexto

Comprovante de pagamento contém dado pessoal e financeiro de terceiro
(nome, documento, valores). Qualquer provedor de IA usado para
extração (OCR/VLM) precisa garantir que esse conteúdo não é retido
nem usado para treinar modelos de terceiros — o oposto disso seria um
vazamento de dado sensível disfarçado de "melhoria de produto".

## Decisão

Nenhum provedor de IA entra em produção sem confirmação explícita de
opt-out de treinamento e retenção zero ou curta. Essa exigência é o
motivo pelo qual escolher um segundo provedor de VLM (Tier 3/4 da
cascata, ADR-0004) não é uma decisão só de custo/qualidade — precisa
ser verificada por contrato/documentação do provedor antes da adoção.

## Estado atual

Nenhum provedor de VLM está em uso em produção hoje — Tier 3/4 da
cascata de extração foi deliberadamente deixado fora do escopo do
Marco 5 (DECISIONS.md [18]: "por enquanto, só OCR, sem gasto com
LLM"). O princípio deste ADR ainda não foi exercido na prática porque
não há provedor de IA de extração rodando contra dado real de
comprovante; `infra/anthropic-vlm.ts` existe no código, sem uso.

## Alternativas consideradas

- **Adotar qualquer provedor por custo/qualidade e revisar retenção
  depois** — rejeitado; a ordem importa, verificar opt-out é
  pré-condição de adoção, não um ajuste posterior.

## Consequências

Quando um segundo provedor de VLM for avaliado (ver `docs/tasks/fase-5/`
para a tarefa), a checagem de opt-out de treinamento e retenção é
critério de aceite obrigatório antes de qualquer chamada com dado real
de tenant — não é suficiente escolher pelo preço ou pela precisão.
