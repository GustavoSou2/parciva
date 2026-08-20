# Camada C — checks comportamentais

**Módulo:** `src/modules/fraud`
**Spec:** `docs/quitou-spec.md` §8.1 (Camada C)
**Depende de:** módulo `fraud` (já existe — fatia 1 da Fase 5, DECISIONS.md [29]), histórico de pagamentos por pagador/contrato (já existe em `payments`/`ledger_entries`)

## Objetivo

Camada C é a única das quatro camadas que olha para padrão ao longo do
tempo, não para um comprovante isolado — por isso depende de histórico
acumulado e não pode reusar o formato de check puro-síncrono das
Camadas A/B sem ajuste (precisa consultar o passado do pagador/tenant,
não só o comprovante recebido).

**Checks:**
- `VELOCITY` — volume/frequência de comprovantes enviados pelo mesmo
  pagador em uma janela curta, fora do padrão histórico dele
- `HISTORY` — pagador sem histórico prévio enviando comprovante de
  valor desproporcional ao perfil dos contratos que tem
- `AMOUNT_PATTERN` — valor do comprovante repete padrão suspeito (ex.:
  mesmo valor exato reaproveitado entre pagadores diferentes — distinto
  de `e2e_reuse`, que é o mesmo E2E ID, não o mesmo valor)
- `PHONE_CHANGE` — número de WhatsApp de origem mudou em relação ao
  cadastrado para aquele pagador desde o último comprovante aceito

## Critérios de aceite

- [x] Checks de Camada C recebem contexto adicional (histórico) que
      Camadas A/B não precisam — decidir se `evaluate.ts` ganha um
      parâmetro novo ou se Camada C vive em função própria que
      compõe o resultado final (evitar forçar todo check a aceitar um
      contexto que só 4 deles usam). Resolvido: `FraudSignals` ganhou 4
      campos booleanos novos (mesmo padrão dos 3 já existentes, todos
      resolvidos pelo chamador); score de Camada C usa pool de peso
      próprio (`BEHAVIORAL_CHECK_WEIGHTS`), somado como incremento
      limitado (`BEHAVIORAL_MAX_CONTRIBUTION = 30`) ao score de Camada
      A/B, nunca diluindo o pool original — ver DECISIONS.md [35].
      Cada consulta de histórico usa `TenantContext` normal
      (`db/client.ts`) — nunca bypass de RLS pra "olhar todo o
      histórico", mesmo entre checks de fraude. Confirmado:
      `fraud/infra/behavior-repository.ts` recebe `db: TenantDb` já
      aberto pela transação (mesma RLS ativa que qualquer outra query
      da mesma transação).
- [x] `VELOCITY`/`HISTORY` entram em `CHECK_WEIGHTS`, não em
      `FORCES_REVIEW` obrigatório — são indícios estatísticos, não
      prova de manipulação de arquivo (diferente de `e2e_reuse`, que é
      prova direta de reuso). Os 4 checks de Camada C produzem
      `result: "warn"` (nunca `"fail"`) — `FORCES_REVIEW` só olha
      `"fail"`, garantindo isso por construção.
- [x] Teste por check, mesmo padrão de `evaluate.test.ts`, com fixture
      de histórico controlado (não dado real de terceiro) —
      `fraud/domain/behavior.test.ts` (exemplo + propriedade) e casos
      novos em `fraud/domain/evaluate.test.ts`.
- [x] Falso positivo documentado como risco aceito: pagador com
      comportamento novo mas legítimo (ex.: primeira parcela grande de
      um contrato novo) não deve sozinho forçar revisão — só some ao
      score. `HISTORY` usa a média das PRÓPRIAS parcelas do pagador
      como baseline, então por construção quase nunca dispara nesse
      cenário exato (o valor já bate com uma parcela real dele mesmo);
      documentado em `fraud/domain/behavior.ts` e no README do módulo.

## Fora de escopo

Camada A/B — ver `docs/tasks/fase-5/01-checks-forenses-camada-a-b.md`.
Modelo de ML para detecção de anomalia — os quatro checks acima são
regra/heurística determinística, igual aos já existentes (CLAUDE.md
invariante 4: a IA propõe, a regra dispõe — aqui nem há IA envolvida).
