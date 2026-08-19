# Checks forenses — resto da Camada A e Camada B

**Módulo:** `src/modules/fraud`
**Spec:** `docs/quitou-spec.md` §8.1 (Camadas A e B)
**Depende de:** módulo `fraud` (já existe — fatia 1 da Fase 5, DECISIONS.md [29])

## Objetivo

A fatia 1 consolidou `amount_match`/`date_plausible`/`e2e_reuse` — os
checks que já eram detectáveis com o que o código já calculava. Esta
tarefa é a próxima fatia: os checks que exigem dado/análise nova.

**Camada A (consistência interna) que falta:**
- `PAYEE_MATCH` — beneficiário do comprovante bate com dados
  cadastrados do tenant (precisa de dado de beneficiário esperado por
  tenant, não existe ainda)
- `E2E_FORMAT`/`INSTITUTION_KNOWN` — E2E ID tem 32 chars e ISPB
  existente; timestamp embutido bate com a data exibida (base de
  ISPBs mínima já existe em `deterministic-extractor.ts`, ampliar)
- `LAYOUT_KNOWN` — layout casa com template conhecido daquele banco

**Camada B (integridade do arquivo) que falta — forense de
imagem/PDF, dependência nova provável:**
- `EXIF_ANOMALY`, `PDF_PROVENANCE`, `ELA_HINT`, `FONT_ANOMALY`

## Critérios de aceite

- [ ] Cada check novo entra em `fraud/domain/evaluate.ts`
      (`CHECK_WEIGHTS`), nunca reescrevendo os 3 checks já existentes
- [ ] `PAYEE_MATCH`/`E2E_REUSE` (peso alto) entram em
      `FORCES_REVIEW`, mesmo padrão já estabelecido
- [ ] Dependência nova (análise de imagem/EXIF) justificada em uma
      linha, avaliada contra o padrão do projeto de client fino/sem
      SDK pesado quando possível
- [ ] Teste por check novo, mesmo padrão de
      `fraud/domain/evaluate.test.ts`

## Fora de escopo

Camada C (comportamento) — ver
`docs/tasks/fase-5/02-camada-c-comportamento.md`. Camada D
(conciliação por extrato) — já implementada, DECISIONS.md [32].
