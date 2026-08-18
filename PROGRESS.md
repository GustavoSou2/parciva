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

**Marco 5 (resto da Fase 2 sem corpus, sem VLM) concluído em
18/08/2026** — Tier 0 (quase-duplicata por hash perceptual), Tier 1
(PDF com camada de texto real) e a tela de fila de revisão
(`/t/<slug>/review`). Segundo provedor de VLM e registro de custo
saíram do escopo por decisão do usuário — ver DECISIONS.md [18].

**Marco 6 (débitos cruzados) concluído em 18/08/2026** — isolamento
cross-tenant testado contra Postgres real nas 13 tabelas de domínio
originais (antes só `receipts`/`inbound_messages` tinham teste, apesar
de RLS existir desde `0001_rls.sql` — a mesma lacuna que a decisão [13]
já tinha revelado como risco real, não hipotético), CI real
(`.github/workflows/ci.yml`, GitHub Actions) rodando `pnpm check` +
`gitleaks` a cada push/PR, e logger estruturado (`src/shared/logger.ts`)
nos processos de produção contínua (workers, rotas de webhook/API). Ver
DECISIONS.md [20]/[21].

**Painel de admin — rota e dado real corrigidos em 18/08/2026**
(DECISIONS.md [24]): `src/app/(admin)/` virou `src/app/admin/` (a
colisão de rota com `/` some), e as duas páginas existentes
(`/admin`, `/admin/tenants`) agora consultam o banco de verdade via
`getAdminDb()`, sem dado hardcoded. Escopo deliberadamente mínimo —
resto da spec §12 (subdomínio, MFA, quebra-vidro, impersonação,
feature flags, DLQ, ações) segue pendente, por decisão do usuário.

A camada SaaS (billing) segue como fatia parcial de domínio, sem
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
- **PDF com camada de texto real** (`src/modules/ingestion/domain/
  pdf-text.ts`, `pdfjs-dist`, Marco 5) — testado com PDF sintético com e
  sem `FlateDecode` (o caso que `buffer.toString("utf-8")` não lia) e
  com PDF corrompido/vazio (nunca lança).
- **Hash perceptual / quase-duplicata** (`src/modules/ingestion/domain/
  normalizer.ts`, aHash 64 bits, Marco 5) — determinístico, distância de
  Hamming pequena entre a mesma imagem recomprimida em qualidades
  diferentes, maior entre imagens diferentes.

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
- **Fila de revisão** (`reconciliation`/`ingestion`, Marco 5): via
  script contra os módulos reais (não HTTP/Server Action, que exigiria
  navegador para o token de ação do Next.js) — criei pagador + contrato
  + um `receipt` real + uma `reconciliation_proposal` em `needs_review`
  sem alvo (payer/contrato não identificados, mesmo caminho de
  `reviewWithoutTarget`), confirmei que aparece em
  `listProposalsByDecision`, aprovei escolhendo pagador/contrato na
  mão: `payments.origin === "receipt"`, `verification_level ===
  "document"` (nunca "confirmado"), `ledger_entries` gravado,
  `proposal.decision === "reviewed_approved"` com `paymentId`
  preenchido. Segunda tentativa de aprovar a mesma proposal falhou com
  `already_reviewed`, como esperado (proteção contra duplo clique). As
  páginas (`/t/<slug>/review`, `/t/<slug>/review/<id>`) e a rota de
  arquivo (`/t/<slug>/receipts/<id>/file`) não foram clicadas num
  navegador de verdade nesta verificação — só a lógica de aplicação
  server-side foi exercitada contra Postgres real.

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
  contra job enfileirado manualmente). Tier 0 (quase-duplicata por hash
  perceptual) e Tier 1 (PDF com camada de texto real) fechados no Marco 5
  (18/08/2026). Falta pro DoD da Fase 2: corpus de ≥200 comprovantes reais
  com gabarito e a métrica formal de acurácia por campo — exigem documento
  financeiro real de terceiro, banido do roadmap desde o início; e Tier 3
  (VLM), fora de escopo por ora (DECISIONS.md [18]).
- **Fatia de camada SaaS (equivalente a parte da Fase 4):** `billing`
  (regras de cota) segue sem conexão a banco. `admin` ganhou conexão
  real em 18/08/2026 (`src/app/admin/_lib/queries.ts`, DECISIONS.md
  [24]) — dashboard e lista de tenants, escopo mínimo, sem
  quebra-vidro/MFA/subdomínio. `identity`/`tenant` deixaram de ser só
  domínio puro — Marco 2 deu infra real e onboarding self-service
  funciona (signup → tenant + owner + login). Falta faturamento real
  (gateway) e quebra-vidro auditado no painel de superadmin.
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
  modernos), mas era uma lacuna real. **Corrigido em 18/08/2026** — ver
  DECISIONS.md [22] (cookie `parciva_csrf` + header `X-Csrf-Token`,
  verificado ao vivo contra `next dev`).

## Em andamento

- **Ingestão e extração** (`src/modules/ingestion/`): Tier 0
  (quase-duplicata por hash perceptual) e Tier 1 (PDF real) fechados no
  Marco 5. VLM (Tier 3, `infra/anthropic-vlm.ts`) existe no código mas
  não está plugado no worker — por decisão do usuário, não falta técnica
  (DECISIONS.md [18]): todo comprovante que Tier 1/2 não resolverem cai
  em revisão humana, sem escalar a nenhum modelo.
- **UI real do produto — parcial.** `/t/<slug>/{contracts,payers,review}`
  existem e funcionam (Marcos 3 e 5), mas são formulários mínimos/tabelas
  simples — não a UI polida dos tokens Parciva (spec §13.2: hierarquia
  canvas→panel→card com sombra zero, escala tipográfica binária, etc.).
  As outras 4 telas da spec (Painel, Comprovantes, Configurações, Conta)
  não existem.
- **Sem edição/exclusão de pagador ou contrato** (Marco 3 só fez
  criação + leitura) — se um dado for cadastrado errado, hoje não tem
  como corrigir pela UI.
- ~~**`login` não sabe pra qual tenant redirecionar**~~ — **resolvido em
  18/08/2026** (DECISIONS.md [23]). Segunda policy de RLS em
  `memberships`, só de SELECT, escopada ao próprio usuário
  (`self_membership_lookup`), acessada via `getUserDb`/
  `listMembershipsForUser` — nunca bypassa RLS. `/api/auth/login`
  devolve a lista de tenants do usuário; 0 mostra erro, 1 redireciona
  direto, 2+ mostra escolha inline na própria tela de login (campo
  manual "empresa" removido). Achado no processo: `current_setting`
  de uma GUC customizada "reseta" pra string vazia (não `NULL`) numa
  conexão pooled já usada por outra função de acesso — corrigido com
  `NULLIF(..., '')` nas duas policies de `memberships`
  (`0011_harden_membership_rls_null_guc.sql`). Verificado ao vivo
  contra `next dev`: usuário em 2 tenants recebe os dois no login,
  usuário em 1 recebe só o dele.

## Roadmap ativo (marcos, débito das Fases 0–3)

Sequência acordada para fechar o débito das Fases 0–3 sem produção/deploy
(isso fica documentado como dívida separada, não faz parte deste
roadmap) e sem corpus de comprovantes reais (Fase 2 fica sem a métrica
formal de acurácia por enquanto):

### Por que os Marcos 3, 4 e 5 foram necessários

Os Marcos 1 (motor de alocação) e 2 (autenticação) entregaram peças
corretas, mas isoladas — provadas só por teste automatizado ou script
manual, sem nenhum jeito de uma pessoa de verdade usar o produto.

- **Marco 3 existiu porque sem UI o motor era invisível.** A spec pede
  explicitamente que a Fase 1 (contratos/pagadores/motor, sem IA, sem
  WhatsApp) já seja "um produto usável, que substitui a planilha" —
  isso pressupõe alguém clicando em tela, não só `curl`/teste. Sem o
  Marco 3, não havia como criar um pagador ou registrar um pagamento
  fora de um script.
- **Marco 4 existiu porque ingestão e motor eram dois sistemas
  desconectados.** O comprovante chegava pelo WhatsApp, era extraído,
  e o resultado morria em `receipts.status` sem nunca virar um
  pagamento real nem cair numa fila de revisão de verdade — o
  `origin=receipt` do motor de alocação nunca tinha sido exercitado.
  Sem o Marco 4, o canal WhatsApp era uma forma cara de "ler" um
  comprovante sem fazer nada útil com o que foi lido; o produto inteiro
  (reconciliação automática, a proposta central do Parciva) não existia
  de ponta a ponta.
- **Marco 5 existe porque a extração hoje só cobre 2 dos 6 tiers da
  cascata de custo da spec (§7.1)** — determinístico (Tier 1) e OCR
  local (Tier 2). Todo comprovante que essas duas etapas não resolvem
  cai direto em revisão humana, porque não há VLM plugado no worker:
  na prática isso significa que a maior parte do volume real (foto
  borrada, layout de banco não previsto, PDF digitalizado sem camada de
  texto) nunca seria automatizada — o oposto do objetivo da cascata,
  que é "a maioria do comprovante nunca chega a um LLM" só depois de
  esgotar as etapas baratas. Também não existe UI de fila de revisão
  (a única forma de ver o que caiu em `needs_review` hoje é consultar o
  banco direto) nem um segundo provedor de VLM com fallback — o único
  provedor hoje (`infra/anthropic-vlm.ts`) está hardcoded, sem a
  interface plugável que a própria spec exige (§7.3, "arquitetura
  anti-lock-in") — um único ponto de falha de custo/disponibilidade.

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
5. ~~**Marco 5 — Resto da Fase 2 (sem corpus, sem VLM)**~~ —
   **concluído 18/08/2026.** Escopo original incluía Tier 3 (segundo
   provedor de VLM); perguntado antes de implementar, o usuário optou
   por **só OCR, sem gasto com LLM por enquanto** — ver DECISIONS.md
   [18]. O que foi entregue:
   - **Tier 0 — quase-duplicata por hash perceptual.**
     `computePerceptualHash`/`hammingDistance`
     (`ingestion/domain/normalizer.ts`, aHash 64 bits via `sharp`, sem
     dependência nova) + `findNearDuplicateByPerceptualHash`
     (`infra/receipt-repository.ts`, varre as 200 receipts mais
     recentes do tenant — Hamming distance não é indexável no
     Postgres). Reenvio recortado/recomprimido (spec C-02) agora cai no
     mesmo caminho de `duplicate` que bytes idênticos já usavam — sem
     OCR redundante. `content_hash` exato já causava short-circuit
     antes deste marco; só faltava a parte de quase-duplicata.
   - **Tier 1 — PDF com camada de texto real.** `ingestion/domain/
     pdf-text.ts` (`extractPdfText`, via `pdfjs-dist`) substitui
     `buffer.toString("utf-8")` — que funcionava só por acidente em PDF
     não comprimido. Testado com fixtures de PDF sintéticas (não corpus
     real) com e sem `FlateDecode`, e com PDF corrompido/vazio (nunca
     lança, devolve `""` — mesmo contrato de "sem contribuição" da
     cascata).
   - **Tela de fila de revisão** (`/t/<slug>/review` +
     `/t/<slug>/review/<proposalId>`) — lista `needs_review`, mostra
     comprovante (nova rota `/t/<slug>/receipts/<id>/file`, lê do disco
     via `readReceiptFile`) × dados extraídos lado a lado. "Rejeitar"
     usa `markProposalDecision` (ocioso desde o Marco 4). "Aprovar"
     é caminho novo (`approveReceiptProposal`,
     `reconciliation/infra/payment-repository.ts`): recalcula a
     alocação na hora (nunca reaproveita o que foi gravado quando a
     proposta foi criada), trava a proposal contra duplo clique
     (`already_reviewed`), aplica o pagamento como `origin: "receipt"`/
     `verificationLevel: "document"` (nunca "confirmado" — decisão
     [5]) e grava a decisão como `reviewed_approved` — valor de enum
     novo, distinto de `auto_applied` (decisão [19], quem decidiu fica
     na auditoria). Verificado ponta a ponta contra Postgres real
     (criar proposal sem alvo → listar → aprovar escolhendo
     pagador/contrato → conferir `payments`/`ledger_entries` → segunda
     tentativa de aprovar falha com `already_reviewed`).
   - **Fora do Marco 5** (por decisão do usuário, DECISIONS.md [18]):
     Tier 3/4 (VLM), segundo provedor, interface `ExtractionProvider`
     plugável, registro de custo por extração (`cost_micros` continua
     `NULL` — sem VLM não há custo a registrar). Também fora,
     deliberadamente, como já era antes: Tier 1.5 (QR/BR Code EMV);
     corpus de ≥200 comprovantes reais com gabarito e métrica formal de
     acurácia (exigem documento financeiro real de terceiro, banido do
     roadmap desde o início); orçamento por tenant/circuit breaker de
     custo (§7.5 — depende de billing real, Fase 4 separada).
6. ~~**Marco 6 — Débitos cruzados**~~ — **concluído 18/08/2026.**
   `tests/security/` ganhou 3 arquivos novos cobrindo as 13 tabelas de
   domínio originais (payers/contracts/installments/payments/
   payment_allocations/credit_balances/ledger_entries via o motor real,
   `executeManualPayment`; psp_connections/charges/charge_installments
   via insert cru, Modelo B sem repositório ainda; memberships/
   subscriptions/usage_counters/audit_logs — este último com teste
   extra confirmando que a linha global do superadmin, tenant_id NULL,
   não vaza pra sessão nenhuma). `pnpm test:tenant` virou
   `vitest run tests/security` (glob). CI real em
   `.github/workflows/ci.yml` (GitHub Actions): Postgres/Redis
   efêmeros, roda `infra/init-db.sql` (mesmo script de dev) antes de
   migrar, `pnpm check` + `pnpm secrets:scan` (gitleaks) a cada push/PR
   — validado localmente ponta a ponta contra containers descartáveis
   antes de existir a primeira run real. Logger estruturado
   (`src/shared/logger.ts`, hand-rolled) nos workers e rotas de
   webhook/API — `db/seed.ts`/`db/migrate.ts` ficaram de fora de
   propósito. Achado lateral corrigido junto: dois lockfiles no
   repositório (resolvido a favor de `pnpm-lock.yaml`) e
   `db:migrate`/`db:seed` sem `--env-file=.env`. Ver DECISIONS.md
   [20]/[21].

Provisionar o role `parciva_app` **em CI já está resolvido** (o job
roda `infra/init-db.sql` antes de migrar) — falta só staging/produção,
que continuam como dívida de infra separada (DECISIONS.md [13]).

**Dívidas soltas pequenas — concluídas em 18/08/2026:** CSRF em
`/api/team/invite` e `db:reset` implementado (DECISIONS.md [22]);
"pra qual tenant o login redireciona" também fechado, à parte, por
mexer no modelo de RLS (DECISIONS.md [23] — segunda policy em
`memberships`, `getUserDb`/`listMembershipsForUser`).

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
- **`src/shared/{crypto,errors}.ts` não existem.** Não há criptografia de
  coluna para documento/telefone. (`logger.ts` existe desde o Marco 6,
  DECISIONS.md [21] — cobertura parcial, só processos de produção
  contínua; `storage.ts` já existe, em v1 mínima — ver DECISIONS.md [7].)
- **Dependências instaladas e não usadas**: `twilio` (SDK) não é importado
  em nenhum arquivo — o código chama a REST API do Twilio manualmente via
  `fetch`; `sharp` só é usado em `normalizer.ts`, ainda longe da cobertura
  de pré-processamento de imagem que a cascata de extração vai precisar.
- **Inconsistência de histórico git**: o commit `0bd9205` ("initial
  project", 17/08/2026) é cronologicamente o mais recente mas contém a
  fundação (schema, docs, config) que os commits de "fase 3" e "fase 4"
  (13/08/2026) já pressupunham. Não afeta o estado atual do código, mas
  vale ter em mente ao interpretar o histórico.
- **Painel de superadmin — rota e dado real corrigidos (18/08/2026,
  DECISIONS.md [24]), resto segue pendente.** `src/app/admin/{page,
  tenants/page}.tsx` (era `(admin)`, colidia com `/`) agora consultam
  `getAdminDb()` de verdade — verificado ao vivo, números batendo com
  o banco. Ainda faltam, por decisão explícita de escopo mínimo:
  subdomínio real (path `/admin` é só o desbloqueio, não o alvo
  final), MFA/login independente (auth continua `x-admin-secret`),
  quebra-vidro auditado (§12 da spec), impersonação, feature flags,
  fila de DLQ, ações (mudar plano/suspender/conceder crédito).
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
- **VLM (Tier 3/4), segundo provedor e registro de custo — fora do
  roadmap ativo por decisão do usuário** (Marco 5, DECISIONS.md [18]):
  "por enquanto, só OCR, sem gasto com LLM". `infra/anthropic-vlm.ts`
  segue no código, sem uso; `receipt_extractions.cost_micros` continua
  `NULL`. Retomar quando o usuário decidir gastar com LLM — não é
  esquecimento, é escolha registrada.
- **Dois lockfiles no repositório — resolvido no Marco 6.** Achado no
  Marco 5 (`pnpm install` revelou `package-lock.json` do npm,
  inconsistente com os comandos `pnpm` do CLAUDE.md). Confirmado com o
  usuário: `package-lock.json` removido do controle de versão,
  `pnpm-lock.yaml` é o único lockfile agora, `packageManager:
  "pnpm@9.15.9"` fixado no `package.json`.
- **`db:reset` estava quebrado — corrigido em 18/08/2026.** `package.json`
  chamava `tsx src/db/reset.ts`, mas esse arquivo nunca existiu no
  repositório (achado durante o Marco 6). Implementado (DECISIONS.md
  [22]) como `TRUNCATE ... CASCADE` em todas as tabelas de `public`,
  com guarda contra rodar fora de `localhost`. Testado de verdade
  contra o Postgres de dev.
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
