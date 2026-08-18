# Progresso — Parciva

Estado do projeto em 18 de agosto de 2026, com base no código real em `src/`,
não apenas na spec. Ver `DECISIONS.md` para o porquê de cada escolha.

## Estado geral

O projeto tem fundação sólida (schema de 21 tabelas, RLS e trigger de ledger
reais no banco, `Money`/`document`/`Result` testados), a fatia de ingestão
+ canal WhatsApp **conectada de ponta a ponta ao banco de dados**, e agora
também o **motor de alocação + ledger (núcleo da Fase 1) existe como
módulo de aplicação de verdade**: `payers`/`contracts`/`ledger`/
`reconciliation` — CRUD de pagador e contrato, geração de cronograma,
motor de alocação puro e testado por propriedade, registro manual de
pagamento e reversão, tudo escrevendo em `payments`/`payment_allocations`/
`installments`/`ledger_entries` de verdade, dentro de uma única transação
com `SELECT ... FOR UPDATE`. Verificado ponta a ponta contra Postgres real
(criar pagador → contrato de 3 parcelas → pagar → reverter → conferir que
voltou ao estado original).

Isso é um roadmap por marcos (ver plano de sessão) cobrindo o débito das
Fases 0–3: **Marcos 1 (motor de alocação + ledger), 2 (autenticação e
sessão), 3 (telas de Contratos e Pagadores) e 4 (ligar ingestão ao
motor) concluídos.** O produto agora tem uma primeira UI de verdade
além do painel admin estático: login → `/t/<slug>/contracts` e
`/t/<slug>/payers`, com formulários reais (Server Actions do Next.js,
sem JavaScript de cliente exigido) criando pagador/contrato e
registrando/revertendo pagamento — tudo escrevendo no banco de verdade
via os módulos dos Marcos 1/2, nada mockado. Verificado com o servidor
`next dev` real: requisições HTTP confirmam 200/401/404 conforme
sessão/tenant, e o cronograma de parcelas, o status de cada uma e o
histórico de lançamentos mudam corretamente na página depois de
registrar e depois de reverter um pagamento.

Com o Marco 4, o caminho `origin=receipt` do motor de alocação (spec
§6.6) finalmente é exercitado de verdade: um comprovante que chega pelo
WhatsApp é identificado ao pagador (§6.3, telefone → documento
mascarado → nome fuzzy), tem um contrato-alvo selecionado (§6.4) e,
se confiança/identificação/alocação/valor/data passarem em todas as
checagens reais, é **auto-aplicado** — senão cai em
`reconciliation_proposals` para revisão humana, nunca decidido sozinho
fora dessas condições. Risco/fraude (parte do §6.6) é **no-op
documentado** neste marco — o módulo de fraude é da Fase 5 e não existe
ainda; ver "Achados" e DECISIONS.md [17] para o que isso significa em
termos do invariante 5 do CLAUDE.md.

Próximo é o **Marco 5** — resto da Fase 2 sem corpus de comprovantes
reais (Tier 0 real, Tier 1 PDF com camada de texto, tela de fila de
revisão, segundo provedor de VLM).

A camada SaaS (billing/admin) segue como fatia parcial de domínio, sem
conexão a banco.

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
- **Geração de cronograma** (`src/modules/contracts/domain/schedule.ts`) —
  `generateMonthlySchedule`, com teste de propriedade garantindo que a
  soma das parcelas geradas bate exatamente com o principal.
- **Motor de alocação** (`src/modules/reconciliation/domain/
  allocation-engine.ts`) — `allocatePayment`, puro, spec §6.4/§6.5: 4
  testes de propriedade (fast-check) + os casos de borda testáveis em
  função pura da tabela §6.7 (tolerância, quitação múltipla, sobra,
  imputação juros→multa→principal, `early_payment_policy`). Achou e
  corrigiu um bug real de saldo negativo durante o próprio
  desenvolvimento — ver "Achados" abaixo.
- **Hash de senha** (`src/shared/password.ts`, `@node-rs/argon2`) —
  roundtrip, salt aleatório (mesma senha nunca gera o mesmo hash duas
  vezes), rejeita hash malformado sem lançar.
- **Sessão e CSRF** (`src/modules/identity/domain/session.ts`) — geração/
  hash de token, expiração em 7 dias, token CSRF derivado por HMAC
  (comparação em tempo constante), tudo testado.

Testado contra Postgres vivo (não é mock — `tests/security/`, script
`pnpm test:tenant`):

- **Isolamento cross-tenant** para `receipts` e `inbound_messages`: SELECT
  não vaza linha de outro tenant (nem por id direto), e o banco recusa
  INSERT com `tenant_id` incompatível com a sessão. Este teste pegou um bug
  real na primeira execução — ver "Achados" abaixo e DECISIONS.md [13].

Verificado manualmente, ponta a ponta, contra infraestrutura real (Postgres +
Redis do `docker-compose.yml`, sem mock):

- **Fluxo completo webhook→fila→worker→banco**: um comprovante enfileirado
  é processado pelo worker real (cascata determinístico→OCR), o resultado é
  validado e gravado em `receipts` (`status` correto: `extracted`/`review`/
  `rejected`/`failed`) e `receipt_extractions`, e o arquivo original é
  gravado em `storage/receipts/<tenant_id>/<aa>/<bb>/<content_hash>.<ext>`.
  Dedupe por `content_hash` confirmado funcionando (segunda tentativa com o
  mesmo conteúdo é ignorada, sem duplicar linha). Isso ainda não rodou contra
  um webhook Twilio real (só contra job enfileirado manualmente) — falta
  validar com tráfego Twilio de verdade em produção/ngrok.
- **Registro manual de pagamento + reversão** (`reconciliation`): criei
  pagador + contrato de 3 parcelas (R$100 cada) via os repositórios reais,
  paguei R$250 (quitou 2 parcelas, deixou 1 parcial de R$50), conferi
  `ledger_entries`/`payment_allocations` corretos, revertei — as parcelas
  voltaram exatamente ao estado original. A trigger append-only bloqueou
  minha tentativa de limpar os dados de teste via `DELETE` — confirmação
  de que a proteção da decisão [2] é real, não decorativa.
- **Autenticação de ponta a ponta** (`identity`/`tenant`, Marco 2): via
  requisições HTTP reais contra o `next dev` local (não é teste de
  unidade) — signup cria tenant+owner e já loga (cookie `httpOnly`/
  `SameSite=Lax` setado); login com senha certa funciona, com senha
  errada devolve `401` genérico; rota protegida (`/api/team/invite`)
  devolve `401` sem cookie (camada 1, middleware Edge) e valida sessão
  de verdade quando o cookie existe (camada 2); convite gera link
  logado, aceitar o convite define senha + loga automaticamente, e o
  mesmo token não pode ser reusado depois; login do convidado funciona
  com a senha recém-definida; `logout` invalida a sessão (tentativa
  seguinte com o mesmo cookie falha); rate limit do login (5/min por IP)
  bloqueia depois de 5 tentativas, via Redis.
- **Telas de Contratos e Pagadores** (Marco 3): via requisições HTTP
  reais contra `next dev` — `/t/<slug>/contracts` devolve `200` com
  cookie de sessão válido, `401` sem cookie, `404` com cookie válido
  mas slug de outro tenant (nunca `403` — mesma convenção de
  `resolveTenantContext`). Populei pagador + contrato de 2 parcelas +
  pagamento manual pelos mesmos módulos que as Server Actions chamam, e
  as páginas mostraram tudo certo: lista de pagadores/contratos com o
  nome certo, cronograma com uma parcela "Quitada" e outra "A vencer",
  histórico de lançamentos com `payment_applied`. Revertendo o
  pagamento, a página passou a mostrar as duas parcelas de volta como
  "A vencer", o pagamento como "Estornado" (chip novo, nunca reusa o
  rótulo "Rejeitado" — ver DECISIONS.md), e o `payment_reversed` somado
  ao `payment_applied` no histórico (nunca substituindo — append-only).

## Fases concluídas

Nenhuma fase da spec está formalmente concluída (nenhuma bate o DoD descrito
em `docs/quitou-spec.md` §14). O que existe é melhor descrito por módulo do
que por fase:

- **Fundação parcial (equivalente a partes da Fase 0/1):** schema Drizzle
  para 21 das 28 tabelas da spec, com RLS (`0001_rls.sql` + `0004_ingestion_
  rls.sql`) e trigger append-only do ledger (`0002_ledger_trigger.sql`)
  aplicados de verdade no SQL de migração. `shared/{money,document,result,
  storage}` prontos (storage em v1 mínima, ver DECISIONS.md [7]). Design
  tokens (`design/quitou.tokens.json` + `quitou.theme.css`) e primeiros
  primitivos de UI (`Card`, `Eyebrow`, `Money`, `StatusChip`) existem em
  `src/ui/components/`.
- **Fatia de canal WhatsApp + ingestão (equivalente a parte das Fases 2/3):**
  webhook, validação de assinatura, resolução de tenant real por
  `whatsapp_channels`, dedupe atômico por `MessageSid`, download de mídia,
  enfileiramento, worker com cascata determinístico→OCR real e persistência
  completa em `receipts`/`receipt_extractions`. Falta pro DoD da Fase 3:
  teste automatizado específico de "reenvio duplicado não gera baixa
  duplicada" (hoje só coberto indiretamente pela verificação manual), tratar
  mensagem fora de ordem, e validar em produção contra Twilio real (não só
  contra job enfileirado manualmente). Falta pro DoD da Fase 2: corpus de
  ≥200 comprovantes reais com gabarito, Tier 0 (cache por hash) e Tier 1
  (PDF com camada de texto) — hoje um PDF cai direto no texto bruto do
  buffer, sem parser real.
- **Fatia de camada SaaS (equivalente a parte da Fase 4):** `billing`
  (regras de cota) e um `admin` que é praticamente só tipos seguem sem
  conexão a banco. `identity`/`tenant` deixaram de ser só domínio puro —
  Marco 2 deu infra real e onboarding self-service funciona (signup →
  tenant + owner + login). Falta faturamento real (gateway) e
  quebra-vidro auditado no painel de superadmin.
- **Autenticação — Marco 2 do roadmap, concluído em 18/08/2026:** login
  e-mail/senha (Argon2id via `@node-rs/argon2`), sessão em Postgres
  (`sessions`, não JWT — revogável), convite de usuário (`invite_
  tokens` + `memberships.accepted_at`), RBAC checado de verdade
  (`hasPermission` na rota de convite), rate limit (Redis), CSRF
  derivado por HMAC. Falta pro DoD formal da Fase 0: MFA (adiado,
  decisão explícita — spec marca obrigatório pra owner/admin), envio
  real de e-mail (convite/boas-vindas só logam o link em dev), reset de
  senha.
- **Núcleo da Fase 1 (motor de alocação + ledger) — Marco 1 do roadmap,
  concluído em 18/08/2026:** `payers`/`contracts`/`ledger`/
  `reconciliation` como módulos de aplicação reais, escrevendo em
  `payments`/`payment_allocations`/`installments`/`ledger_entries`.
  `early_payment_policy: "reduce_amount"` cai em `credit_balance` como
  fallback (redistribuir o cronograma futuro é reestruturação, não
  alocação de pagamento — não implementado neste marco, documentado no
  código).
- **UI da Fase 1 (telas de Contratos e Pagadores) — Marco 3 do roadmap,
  concluído em 18/08/2026:** `/t/<slug>/{contracts,payers}` — lista,
  criação (Server Actions, sem API route/fetch), detalhe do contrato
  com cronograma + registro de pagamento + reversão + histórico de
  lançamentos. `StatusChip` ganhou 6 chaves novas
  (`paid`/`pending`/`partial`/`cancelled`/`written_off`/`reversed`),
  mesma disciplina de zero cor semântica da spec §13.1.
- **Ligar ingestão ao motor de alocação (fecha o resto da Fase 3) —
  Marco 4 do roadmap, concluído em 18/08/2026:** `payers/domain/
  identification.ts` (§6.3 — telefone → documento mascarado → nome
  fuzzy via Levenshtein), `reconciliation/domain/select-target.ts`
  (§6.4 — nunca adivinha contrato, desempata só por valor batendo
  exato), `reconciliation/domain/auto-apply-decision.ts` (§6.6 real:
  confiança ≥0,90, identificação forte, alocação sem sobra, data
  plausível, teto de auto-aprovação — risco/fraude é no-op
  documentado, ver DECISIONS.md [17]), tabela nova
  `reconciliation_proposals` (com RLS) como log de auditoria de toda
  decisão. `receipt-worker.ts` agora chama `processReceiptExtraction`
  em vez de decidir `receipts.status` só pela confiança da extração.
  `executeReceiptPayment` decide DENTRO da mesma transação que trava
  as parcelas — a alocação que embasa a decisão é a mesma que acaba
  gravada, sem janela de corrida entre "decidir" e "aplicar". Fecha o
  DoD formal da Fase 1/3 quase inteiro — falta só o que está fora de
  escopo deste marco (ver "Fora do Marco 4" no plano de sessão) e
  risco/fraude de verdade (Fase 5).

## Achados

- **RLS estava sendo ignorada em dev** — o único role do Postgres
  (`parciva`, via `POSTGRES_USER` do `docker-compose.yml`) é superusuário,
  e superusuário ignora RLS incondicionalmente, mesmo com `FORCE ROW LEVEL
  SECURITY`. Pego pelo primeiro teste real de isolamento cross-tenant.
  Corrigido com um role de aplicação separado e não-privilegiado
  (`infra/init-db.sql` → role `parciva_app`), ver DECISIONS.md [13]. Isso
  significa que a camada 1 de defesa da decisão [1] nunca tinha sido
  exercitada de verdade antes desta tarefa.
- **`storage_key` gravava com `\` no Windows** (`path.join` nativo) —
  quebraria a montagem de path no Nginx em produção (VPS Linux). Corrigido
  para sempre usar `/`, independente do SO.
- **Bug do `extractPaidAt` — corrigido no Marco 4.** Produzia `paid_at`
  sem timezone (`"2026-08-17T14:30:00"` ou só `"2026-08-17"`), mas
  `extraction-schema.ts` exigia `z.string().datetime()` (só `Z`) — todo
  comprovante com data extraída caía em `validation_failed`. Corrigido
  em duas partes: com hora, produz `-03:00` explícito (comprovante
  brasileiro de PIX mostra horário local, nunca UTC — inventar `Z`
  seria afirmar um fuso que o texto não informa); sem hora, `paid_at`
  fica AUSENTE, nunca meia-noite inventada (spec §7.4, "nunca chutar").
  `extraction-schema.ts` passou a aceitar `.datetime({ offset: true })`.
- **`executeReceiptPayment` não tratava `transaction_ref` duplicado —
  achado e corrigido durante a verificação ponta a ponta do Marco 4.**
  `executeManualPayment` já capturava a violação de unicidade de
  `payments_tenant_transaction_ref_hash_unique` (spec §5.5) e devolvia
  `duplicate_transaction`; o caminho novo (`executeReceiptPayment`) não
  tinha o mesmo `try/catch` — um comprovante com o mesmo `transaction_ref`
  de um pagamento já aplicado derrubava o job do worker com exceção não
  tratada em vez de cair em revisão. Reproduzido de propósito no script
  de verificação (dois comprovantes com o mesmo E2E id) antes de
  corrigir. Mesmo padrão de tratamento agora nos dois caminhos.
- **Bug de saldo negativo no motor de alocação, achado e corrigido durante
  o Marco 1**: a primeira versão de `allocatePayment` alocava o `devido`
  cheio quando o pagamento vinha dentro da tolerância mas abaixo do
  devido — isso fazia o valor disponível ficar negativo silenciosamente.
  Corrigido: o valor consumido é sempre `min(disponível, devido)`; a
  tolerância perdoa via status `paid`, nunca inventando dinheiro alocado
  que não existiu. Achado pelo próprio teste de caso de borda (§6.7,
  "pagamento de R$ 0,01 a menos"), não em produção.
- **Convenção de direção do ledger não estava definida na spec** — decisão
  nova, registrada em DECISIONS.md [14]: `credit` reduz dívida (pagamento
  aplicado), `debit` aumenta (reversão/ajuste).
- **`payments` não tem `contract_id` direto no schema** (spec §5.2) —
  achado ao construir `listPaymentsByContract` (Marco 3). O caminho real
  é `payments → payment_allocations → installments.contract_id`. Não é
  bug, é o desenho da spec, mas vale saber pra não tentar filtrar
  `payments` por contrato direto em código futuro.
- **`/api/team/invite` (Marco 2) nunca chegou a checar o token CSRF**
  que `deriveCsrfToken`/`verifyCsrfToken` implementam — achado revisando
  o Marco 2 durante o planejamento do Marco 3. `SameSite=Lax` cobre a
  maior parte do risco (bloqueia POST cross-site em navegadores
  modernos), mas é uma lacuna real, não uma decisão. Registrado como
  pendência, não corrigido ainda.

## Em andamento

- **Isolamento cross-tenant nas 13 tabelas de domínio originais** (`payers`,
  `contracts`, `installments`, `payments`, `payment_allocations`,
  `credit_balances`, `psp_connections`, `charges`, `charge_installments`,
  `ledger_entries`, `memberships`, `subscriptions`, `usage_counters`,
  `audit_logs`): protegidas por RLS desde `0001_rls.sql`, mas ainda sem
  teste que exercite isso contra Postgres vivo — `tests/security/
  tenant-isolation.test.ts` cobre hoje só `receipts`/`inbound_messages`
  (as tabelas tocadas nesta tarefa). Dado o que a decisão [13] revelou (RLS
  silenciosamente inativa em dev por meses), estender esse teste para as
  tabelas originais é prioridade, não só desejável.
- **Ingestão e extração** (`src/modules/ingestion/`): worker já persiste de
  verdade, mas ainda não há Tier 0 (cache por `content_hash`/`perceptual_
  hash` — a coluna existe, não é computada) nem Tier 1 (PDF com camada de
  texto real — hoje o buffer de PDF é decodificado como texto bruto,
  best-effort). VLM (Tier 3, `infra/anthropic-vlm.ts`) existe no código mas
  não está plugado no worker em produção.
- **UI real do produto — parcial.** `/t/<slug>/{contracts,payers}`
  existem e funcionam (Marco 3), mas são formulários mínimos/tabelas
  simples — não a UI polida dos tokens Parciva (spec §13.2: hierarquia
  canvas→panel→card com sombra zero, escala tipográfica binária, etc.).
  As outras 5 telas da spec (Painel, Fila de revisão, Comprovantes,
  Configurações, Conta) não existem.
- **Sem edição/exclusão de pagador ou contrato** (Marco 3 só fez
  criação + leitura) — se um dado for cadastrado errado, hoje não tem
  como corrigir pela UI.
- **`login` não sabe pra qual tenant redirecionar** quando o usuário
  pertence a mais de um (ou mesmo só um, sem informar o slug) — não
  existe hoje um jeito de listar "meus tenants" sem já saber o slug de
  um deles, porque `memberships` tem RLS de verdade (não dá pra
  consultar às cegas sem `app.tenant_id` setado). Mitigado com um campo
  opcional "empresa" no formulário de login (atalho de navegação, não
  autenticação) — resolver isso de vez (tenant picker, ou lembrar o
  último tenant acessado) fica pendente.

## Roadmap ativo (marcos, débito das Fases 0–3)

Sequência acordada para fechar o débito das Fases 0–3 sem produção/deploy
(isso fica documentado como dívida separada, não faz parte deste
roadmap) e sem corpus de comprovantes reais (Fase 2 fica sem a métrica
formal de acurácia por enquanto):

1. ~~**Marco 1 — Motor de alocação + ledger**~~ — **concluído 18/08/2026.**
2. ~~**Marco 2 — Autenticação e sessão**~~ — **concluído 18/08/2026.**
   Login, sessão, convite, RBAC, rate limit, CSRF — verificado via HTTP
   real contra `next dev`. MFA ficou fora, deliberadamente (ver
   "Pendências conhecidas").
3. ~~**Marco 3 — Telas de Contratos e Pagadores**~~ — **concluído
   18/08/2026.** `/t/<slug>/{contracts,payers}`, Server Actions,
   verificado via HTTP real contra `next dev` (criar → ver na lista →
   registrar pagamento → ver status mudar → reverter → ver voltar).
4. ~~**Marco 4 — Ligar ingestão ao motor + fechar débitos da Fase 3**~~ —
   **concluído 18/08/2026.** Identificação de pagador (§6.3), seleção
   de contrato-alvo (§6.4), decisão automática vs. revisão real (§6.6,
   risco/fraude no-op documentado — DECISIONS.md [17]),
   `reconciliation_proposals`, teste automatizado de reenvio duplicado,
   `extractPaidAt` corrigido. Verificado ponta a ponta contra fila +
   worker + Postgres reais (telefone bate pagador + valor exato de
   parcela → auto-aplicado; telefone desconhecido → revisão).
5. **Marco 5 — Resto da Fase 2 (sem corpus)** — Tier 0 real, Tier 1 (PDF
   com camada de texto), tela de fila de revisão, segundo provedor de
   VLM (a decidir com o usuário). **Próximo passo.**
6. **Marco 6 — Débitos cruzados** — estender `tenant-isolation.test.ts`
   às 13 tabelas de domínio originais (RLS estava inativa em dev sem
   ninguém saber — DECISIONS.md [13] — então isso é mais urgente do que
   parece), CI local versionado, logger estruturado.

Provisionar o role `parciva_app` fora do `docker-compose.yml` de dev
(staging/produção precisam da mesma separação de role, DECISIONS.md
[13]) fica registrado como dívida de infra, fora deste roadmap de
código. Checar o token CSRF em `/api/team/invite` (achado do Marco 3,
nunca foi ligado no Marco 2) e resolver o "pra qual tenant o login
redireciona" (ver "Em andamento" acima) também ficam como dívida solta,
pequenas o bastante pra não merecerem marco próprio.

## Pendências conhecidas

- **MFA não implementado** — spec §10.2 marca obrigatório para owner/
  admin. Decisão explícita de adiar (não esquecimento): login básico
  primeiro, testável no navegador; TOTP vira marco próprio. `users.
  mfaEnabled`/`mfaSecretRef` já existem no schema, prontos para receber.
- **Nenhum provedor de e-mail real configurado** — convite
  (`identity/application/invite-user.ts`) e boas-vindas (`tenant/infra/
  tenant-repository.ts`) só logam o link/mensagem no console (dev).
  Funcional pra testar o fluxo manualmente, mas ninguém recebe e-mail de
  verdade ainda.
- **Sem "esqueci minha senha"** — depende do mesmo provedor de e-mail
  que falta acima.
- **`docs/adr/` não existe.** `src/shared/money.ts` referencia
  `docs/adr/0003-money-as-integer-cents.md` e `src/shared/document.ts`
  referencia `docs/spec/05-data-model.md` — ambos caminhos mortos. A spec
  inteira ainda vive em dois arquivos únicos (`docs/quitou-spec.md`,
  `docs/quitou-setup.md`); a fatiação em `docs/spec/` e `docs/adr/`
  recomendada pelo próprio `quitou-setup.md` (Parte 4) não foi feita.
- **`docs/tasks/` não existe.** Não há unidade de tarefa versionada por
  fase — o único rastro de "que fase é essa" está em mensagens de commit e
  comentários soltos no código.
- **5 tabelas citadas na spec ainda não existem no schema**: `fraud_checks`,
  `api_keys`, `webhook_endpoints`, `webhook_deliveries`,
  `idempotency_keys` (`reconciliation_proposals` existe desde o Marco 4,
  18/08/2026). Sem as demais, anti-fraude e API pública não têm onde
  persistir — mas `idempotency_keys` provavelmente nunca precisa existir
  para o dedupe de webhook WhatsApp, que já usa `inbound_messages.
  provider_message_id` (ver DECISIONS.md [1], nota de 18/08); ela é
  relevante só para a API pública da Fase 7.
- **Módulos da spec ainda sem pasta**: `fraud`, `charges`, `psp` (`payers`,
  `contracts`, `ledger`, `reconciliation` existem desde o Marco 1,
  18/08/2026).
- **`src/shared/{crypto,errors,logger}.ts` não existem.** Não há logger
  estruturado (tudo é `console.log`/`console.error` direto), nem
  criptografia de coluna para documento/telefone. (`storage.ts` já existe,
  em v1 mínima — ver DECISIONS.md [7].)
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
- **`pnpm test`/`pnpm check` agora exigem Postgres no ar** (docker-compose
  do `infra/`) — `tests/security/tenant-isolation.test.ts` roda contra
  banco real, não mock, e `vitest.config.ts` carrega `.env` automaticamente
  para achar `APP_DATABASE_URL`. Sem o banco no ar, esses comandos falham
  alto (de propósito — CLAUDE.md marca `test:tenant` como "nunca pular"),
  não fazem skip silencioso.
- **`early_payment_policy: "reduce_amount"` não está implementada** —
  cai em comportamento `credit_balance` (nunca perde dinheiro, só não
  redistribui o cronograma futuro automaticamente). Redistribuir
  `amount_cents` das parcelas futuras é reestruturação de cronograma,
  não alocação de um pagamento — não cabe no formato atual de
  `AllocationResult` (`reconciliation/domain/types.ts`).
- **Fora de escopo do Marco 4, deliberadamente:** item 4 do §6.3
  (referência externa tipo "CTR-00432" na mensagem do PIX —
  `ExtractionOutput` não tem esse campo, adicioná-lo mudaria o contrato
  de extração inteiro); "mensagem fora de ordem" (DoD da Fase 3);
  risco/fraude de verdade (§6.6 — Fase 5, ver DECISIONS.md [17]);
  `reconciliation_proposals.risk_score` (não existe no schema — não há
  dado real pra preencher ainda). `field_confidence` também segue nunca
  populado por nenhum tier hoje (nem determinístico nem OCR preenchem
  por campo), então a checagem "nenhum campo crítico abaixo de 0,85"
  do §6.6 só entra em ação quando um tier futuro (VLM) começar a
  preencher essa chave — hoje é um no-op silencioso, não uma lacuna de
  segurança (a confiança geral, que já pondera divergência entre
  tiers, é o proxy disponível).
