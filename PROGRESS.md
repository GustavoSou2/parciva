# Progresso — Parciva

Estado do projeto em 17 de agosto de 2026, com base no código real em `src/`,
não apenas na spec. Ver `DECISIONS.md` para o porquê de cada escolha.

## Estado geral

O projeto tem fundação sólida (schema de 16 tabelas, RLS e trigger de ledger
reais no banco, `Money`/`document`/`Result` testados) e três fatias verticais
parcialmente construídas — ingestão/extração, canal WhatsApp e camada SaaS
(billing/identity/tenant/admin) — mas **nenhuma delas está conectada de ponta
a ponta ao banco de dados ainda**: o webhook do Twilio recebe e enfileira,
o worker roda OCR e imprime o resultado no console, e nada é de fato
persistido em `payments`, `receipts` ou `ledger_entries`. É, na prática, um
esqueleto de Fase 1–4 com peças reais e testadas isoladamente, ainda sem fio
que as una.

## O que está funcionando agora

Testado de ponta a ponta (unidade, sem banco/rede):

- **`Money`** (`src/shared/money.ts`) — branded type de centavos inteiros,
  aritmética segura, com testes.
- **CPF/CNPJ** (`src/shared/document.ts`) — normalização, validação
  (incluindo CNPJ alfanumérico), máscara e hash com pepper, com testes.
- **`Result<T, E>`** (`src/shared/result.ts`) — testado.
- **RBAC declarativo** (`src/modules/identity/domain/authorization.ts`) —
  `ROLE_PERMISSIONS`, `hasPermission`, `canAutoApprove`, com testes.
- **Regras de cota de plano** (`src/modules/billing/domain/quota.ts`) —
  `checkQuota`, `isFeatureEnabled`, com testes.
- **Ciclo de vida do tenant** (`src/modules/tenant/domain/lifecycle.ts`) —
  máquina de estados `trial→active→past_due→suspended→cancelled→purged`, com
  testes.
- **Parsing e assinatura do Twilio** (`src/modules/whatsapp/domain/{parser,
  signature}.ts`) — validação HMAC de `X-Twilio-Signature`, com testes.
- **Máquina de estados da conversa** (`src/modules/whatsapp/domain/
  conversation.ts`) — com testes.
- **Cascata de extração determinística + OCR** (`src/modules/ingestion/
  domain/{deterministic-extractor,pipeline}.ts` +
  `infra/tesseract-ocr.ts`) — regex de E2E ID/valor/data/documento mascarado,
  seguido de Tesseract quando o determinístico falha, com testes.
- **Fluxo real ponta a ponta parcial**: um webhook Twilio válido chega,
  passa pela validação de assinatura, a mídia é baixada, o job é enfileirado
  no BullMQ, o worker consome, roda a extração (determinístico → OCR) e
  loga o resultado. Isso funciona hoje contra Twilio real (não é mock), mas
  termina no `console.log` — nenhum dado sobrevive além do log do worker.

## Fases concluídas

Nenhuma fase da spec está formalmente concluída (nenhuma bate o DoD descrito
em `docs/quitou-spec.md` §14). O que existe é melhor descrito por módulo do
que por fase:

- **Fundação parcial (equivalente a partes da Fase 0/1):** schema Drizzle
  para 16 das 28 tabelas da spec, com RLS (`0001_rls.sql`) e trigger
  append-only do ledger (`0002_ledger_trigger.sql`) aplicados de verdade no
  SQL de migração — não só descritos. `shared/{money,document,result}` prontos
  e testados. Design tokens (`design/quitou.tokens.json` +
  `quitou.theme.css`) e primeiros primitivos de UI (`Card`, `Eyebrow`,
  `Money`, `StatusChip`) existem em `src/ui/components/`.
- **Fatia de canal WhatsApp (equivalente a parte da Fase 3):** endpoint de
  webhook, validação de assinatura, dedupe (stub), download de mídia,
  enfileiramento e máquina de estados de conversa — commit `f533aa3`.
  Falta a parte que fecha a Fase 3 de verdade: persistência em banco,
  resolução real de tenant e mensagens de retorno conectadas ao resultado
  real da extração.
- **Fatia de camada SaaS (equivalente a parte da Fase 4):** módulos
  `identity` (RBAC), `billing` (regras de cota), `tenant` (lifecycle) e um
  `admin` que é praticamente só tipos — commit `ac2968f`. Falta faturamento
  real (gateway), onboarding self-service, e quebra-vidro auditado no
  painel de superadmin.

## Em andamento

- **Ingestão e extração** (`src/modules/ingestion/`): o módulo mais maduro
  do projeto. Cascata determinístico → OCR local funciona; VLM
  (`infra/anthropic-vlm.ts`, Tier 3) existe no código mas não está plugado
  no worker em produção; não há Tier 0 (cache por hash) nem Tier 1
  (PDF com camada de texto) implementados; não há persistência em
  `receipts`/`receipt_extractions` porque essas tabelas não existem no
  schema ainda.
- **Conexão do webhook Twilio ao banco real**: `tenantId` está hardcoded
  como string vazia em `src/app/api/webhooks/whatsapp/route.ts`;
  `checkDuplicate` é stub (`Promise.resolve(false)`); número de origem
  (`TWILIO_WHATSAPP_FROM`) é global, não por tenant (ver decisão [11] em
  `DECISIONS.md`).
- **Worker de recebimento** (`src/workers/receipt-worker.ts`): `deps` de
  `checkDuplicate` e `runDeterministicExtraction` são stubs hardcoded com
  comentário explícito "substituir pelos deps reais quando o banco estiver
  conectado" — ou seja, a conexão worker↔banco é o próximo passo mecânico
  óbvio, não uma decisão em aberto.

## Próximos passos

Em ordem de prioridade (o que desbloqueia o resto mais rápido):

1. **Conectar o worker e o webhook ao banco real.** Criar o schema que falta
   para o caminho de ingestão (`receipts`, `receipt_extractions` no mínimo;
   `idempotency_keys` para dedupe correto de webhook), resolver `tenantId`
   real a partir de `whatsapp_channels` (ou, no mínimo, de uma tabela
   temporária de mapeamento telefone→tenant enquanto o número for
   compartilhado), e substituir os stubs de `checkDuplicate` e
   `runDeterministicExtraction` por implementações reais que leem/escrevem
   no Postgres via `TenantContext`. Sem isso, nada do resto tem onde
   persistir.
2. **Escrever `tests/security/tenant-isolation.test.ts`.** O script
   `test:tenant` do `package.json` já aponta para esse arquivo, mas ele não
   existe — o teste mais importante do projeto (cross-tenant leak) está
   ausente, e a spec trata isso como trava obrigatória desde a Fase 0, não
   como algo a adiar.
3. **Construir o módulo `reconciliation` (motor de alocação, §6 da spec) e
   o módulo `ledger`** como aplicação — hoje a tabela `ledger_entries` existe
   e está protegida no banco, mas nenhum código escreve nela. Sem o motor de
   alocação determinístico e testado por propriedade (fast-check), a
   ingestão não tem para onde mandar o resultado da extração além do log.

## Pendências conhecidas

- **`docs/adr/` não existe.** `src/shared/money.ts` referencia
  `docs/adr/0003-money-as-integer-cents.md` e `src/shared/document.ts`
  referencia `docs/spec/05-data-model.md` — ambos caminhos mortos. A spec
  inteira ainda vive em dois arquivos únicos (`docs/quitou-spec.md`,
  `docs/quitou-setup.md`); a fatiação em `docs/spec/` e `docs/adr/`
  recomendada pelo próprio `quitou-setup.md` (Parte 4) não foi feita.
- **`docs/tasks/` não existe.** Não há unidade de tarefa versionada por
  fase — o único rastro de "que fase é essa" está em mensagens de commit e
  comentários soltos no código.
- **12 das 28 tabelas da spec não existem no schema**: `receipts`,
  `receipt_extractions`, `fraud_checks`, `reconciliation_proposals`,
  `whatsapp_channels`, `inbound_messages`, `api_keys`, `webhook_endpoints`,
  `webhook_deliveries`, `idempotency_keys`. Sem elas, ingestão, anti-fraude,
  conciliação e API pública não têm onde persistir.
- **`tests/security/` e `tests/unit/` estão vazios.** Todos os testes reais
  estão co-localizados com o código-fonte, o que é bom para os módulos que
  têm teste — mas o teste de isolamento cross-tenant contra um Postgres
  vivo simplesmente não existe.
- **Módulos inteiros da spec ainda não têm pasta**: `reconciliation`,
  `fraud`, `charges`, `psp`. `ledger` e `contracts` têm tabela no banco mas
  nenhum módulo de aplicação/domínio.
- **`src/shared/{crypto,errors,storage,logger}.ts` não existem.** Não há
  logger estruturado (tudo é `console.log`/`console.error` direto), não há
  criptografia de coluna para documento/telefone, e não há o módulo de
  storage durável que a spec §3.4 descreve — o diretório `storage/receipts`
  existe, mas nada grava nele seguindo o protocolo (tmp → fsync → rename →
  fsync do diretório → commit).
- **`db:seed` e `db:reset` apontam para arquivos inexistentes**
  (`src/db/seed.ts`, `src/db/reset.ts`) — rodar esses scripts hoje falha.
- **Dependências instaladas e não usadas**: `twilio` (SDK) não é importado
  em nenhum arquivo — o código chama a REST API do Twilio manualmente via
  `fetch`; `sharp` só é usado em `normalizer.ts`, ainda longe da cobertura
  de pré-processamento de imagem que a cascata de extração vai precisar.
- **Inconsistência de histórico git**: o commit `0bd9205` ("initial
  project", 17/08/2026) é cronologicamente o mais recente mas contém a
  fundação (schema, docs, config) que os commits de "fase 3" e "fase 4"
  (13/08/2026) já pressupunham. Não afeta o estado atual do código, mas
  vale ter em mente ao interpretar o histórico.
- **Painel de superadmin é UI estática**: `src/app/(admin)/page.tsx` e
  `tenants/page.tsx` mostram métricas e tenants hardcoded, não consultam o
  banco. Não há quebra-vidro auditado (§12 da spec) implementado. Há também
  uma colisão de rota conhecida e documentada no `README.md` do módulo
  `admin`: `(admin)/page.tsx` e `src/app/page.tsx` disputam `/`.
