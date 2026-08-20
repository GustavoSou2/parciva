# Progresso — Parciva

Estado do projeto em 19 de agosto de 2026, com base no código real em `src/`,
não apenas na spec. Ver `DECISIONS.md` para o porquê de cada escolha.

## Ações pendentes do usuário

Coisas que **só você** consegue fazer — não é trabalho de código, é
passo manual em painel externo. Nenhuma delas bloqueia o resto do
projeto, mas sem elas as duas integrações abaixo continuam rodando só
com segredo/chave fake, nunca testadas contra a API real.

- [ ] **AbacatePay — segredo do webhook.** Criar o webhook no painel da
  AbacatePay (ambiente dev) apontando para um túnel ngrok
  (`NGROK_AUTH_TOKEN` já está no `.env`, só falta subir o túnel e criar
  o webhook apontando pra ele) e me passar o segredo gerado, pra eu
  colocar em `ABACATE_PAY_WEBHOOK_SECRET`. Detalhe completo: PROGRESS.md
  "Pendências conhecidas" e DECISIONS.md [25].
- [ ] **Resend — conta e chave de API.** Criar conta na Resend, gerar
  uma `RESEND_API_KEY` e me passar (ou colar direto no `.env`). Sem
  domínio verificado, o envio real cai no sandbox `onboarding@resend.dev`
  (funciona pra testar, não pra produção) — se quiser remetente com seu
  próprio domínio, verificar o domínio na Resend e me passar o endereço
  final pra `EMAIL_FROM_ADDRESS`. Detalhe completo: PROGRESS.md
  "Pendências conhecidas" e DECISIONS.md [33].

## Próximo passo sugerido

Com MFA (DECISIONS.md [36]) e Fase 5 Camada C (DECISIONS.md [35])
concluídos e verificados ao vivo contra Postgres real, não há uma
lacuna de segurança óbvia sobrando — as opções abaixo são igualmente
prontas pra decidir (specs já escritas, só falta escolher):

- **Resto da Fase 5 — checks forenses Camada A/B** (`docs/tasks/
  fase-5/01-...md`). Traz duas decisões em aberto antes de poder
  começar: qual dado usar pro `PAYEE_MATCH` (beneficiário esperado
  por tenant, não existe ainda) e qual dependência usar pra
  `EXIF_ANOMALY`/`PDF_PROVENANCE`/`ELA_HINT`/`FONT_ANOMALY` (forense
  de imagem/PDF).
- **Cifra de coluna — documento/telefone do pagador**
  (`docs/tasks/fase-0/02-...md`). Mesma urgência de "dado sensível
  hoje em texto claro no banco", mas exige migração expand→migrar→
  contract (mais passos, mais risco de execução) contra um risco
  (dump de banco) menos provável no dia a dia que credencial vazada.
- **Forçar owner/admin a ativar o MFA que acabou de ficar pronto** —
  deliberadamente fora desta fatia (decisão do usuário, DECISIONS.md
  [36]): hoje é opt-in, sem bloquear login de conta existente. Vale
  decidir quando/como nagear ou exigir, sem repetir o risco de travar
  conta sem aviso.
- **Refinamento de UI/UX** (ver "Em andamento" abaixo) — comercialmente
  é a primeira coisa que um cliente real vê, mas ainda não tem tarefa
  fechada em `docs/tasks/`; posso escrever o escopo se for essa a
  escolha.

Fase 6 (cobrança PIX modelo B) e a fatiação de `docs/spec/` seguem
deliberadamente fora da lista — a primeira ainda não foi puxada pelo
usuário (CLAUDE.md já avisa que "chega na Fase 6"), a segunda foi
escopo explicitamente descartado nesta rodada de documentação.

## O que falta para lançar um MVP

MVP aqui significa: um primeiro tenant real usando modelo A (comprovante
via WhatsApp) com dinheiro de verdade, não mais um ambiente de dev. Isso
é ortogonal ao roadmap de fases da spec — dá pra lançar com risco/fraude
parcial e sem MFA, mas não dá pra lançar sem as pendências abaixo, que
hoje só foram testadas contra ambiente de dev/sandbox, nunca contra
tráfego real de produção.

**Bloqueadores — nada disso foi feito ainda, é dívida nova, não
retrabalho de algo quebrado:**

- [ ] **Deploy real na VPS.** Hoje só existe `docker-compose.yml` de
  dev e o role `parciva_app` provisionado em CI (DECISIONS.md [13]) —
  "falta só staging/produção" já estava registrado como dívida de
  infra separada desde o Marco 6, nunca endereçada. Isso inclui:
  provisionar a VPS, rodar `infra/init-db.sql` lá, Nginx na frente
  (TLS + domínio), e o diretório de storage em produção
  (`/var/lib/parciva/receipts`, permissão `0700` — hoje só existe
  `./storage/receipts` de dev).
- [ ] **`X-Accel-Redirect` nunca foi implementado.** ADR-0010/
  DECISIONS.md [7]: a entrega de comprovante hoje é servida direto
  pela rota do Next (`/t/<slug>/receipts/<id>/file`) porque não há
  Nginx em dev. Sem isso em produção, ou implementa o `X-Accel-
  Redirect` de verdade, ou aceita servir arquivo pela aplicação (menos
  seguro, mas destrancaria o MVP se a decisão for adiar o Nginx).
- [ ] **Backup do Postgres.** Não existe hoje nenhuma rotina de
  backup/restore documentada ou testada — dado real de cliente (ledger,
  comprovante, pagador) sem backup é risco inaceitável antes do
  primeiro tenant real.
- [ ] **Número de WhatsApp do tenant real conectado ao Twilio, testado
  com tráfego real.** Todo o pipeline (webhook → fila → worker → banco)
  só foi verificado com job enfileirado manualmente ou contra o
  ambiente de dev do Twilio — nunca contra uma mensagem real chegando
  por um número real. ADR-0006 documenta que "cada tenant conecta o
  próprio número" ainda não está implementado (hoje é número
  compartilhado) — decidir se o MVP aceita essa simplificação para o
  primeiro cliente ou se precisa da arquitetura-alvo antes.
- [ ] **AbacatePay — segredo real do webhook e round-trip HTTP real**
  (ação do usuário já listada no topo deste arquivo, DECISIONS.md
  [25]). Sem isso, cobrança PIX nunca rodou contra tráfego de produção,
  só payload sintético assinado manualmente.
- [ ] **Resend — conta real** (ação do usuário já listada no topo,
  DECISIONS.md [33]). Sem chave real, nenhum e-mail (boas-vindas,
  convite, reset de senha) chega de verdade a um usuário real.

**Fortemente recomendado antes do primeiro cliente, mas não impede
tecnicamente o lançamento:**

- [ ] **UI do produto precisa de uma passada de design de verdade.**
  Hoje é formulário/tabela cru em toda tela — ver o mapeamento
  completo em "Em andamento" abaixo. Não é reconstruir do zero: os
  tokens e primitivos (`design/quitou.tokens.json`,
  `src/ui/components/`) já existem, o trabalho é aplicá-los
  consistentemente em todas as 21 páginas e decidir o que fazer com as
  4 telas que faltam (Painel, Comprovantes, Configurações, Conta
  completa). Tecnicamente o produto funciona sem isso; comercialmente,
  é a primeira coisa que um cliente real vê.
- [ ] **MFA para owner/admin** (`docs/tasks/fase-0/01-mfa-owner-admin.md`)
  — ver "Próximo passo sugerido" acima.
- [ ] **`createProduct` não é idempotente contra "produto já existe" na
  AbacatePay** — se uma tentativa anterior criar o produto lá mas
  falhar antes de persistir `plans.abacate_pay_product_id`, toda
  assinatura futura desse plano trava até correção manual. Baixa
  probabilidade, mas envolve dinheiro real — vale corrigir antes do
  primeiro cliente pagante.
- [ ] **Cifra de coluna — documento/telefone do pagador**
  (`docs/tasks/fase-0/02-...md`). Hoje CPF/CNPJ e telefone do pagador
  ficam em texto claro no banco; um dump exporia dado pessoal de
  terceiro (o pagador, que nem é o cliente direto do Parciva).

**Explicitamente fora do MVP** (fica pra depois, por decisão já
registrada ou por não fazer sentido pro primeiro cliente):

- Fase 6 (cobrança PIX modelo B) — CLAUDE.md já avisa "chega na Fase 6".
- Resto da Fase 5 (checks forenses Camada A/B, Camada C comportamental)
  — Camada A básica (`amount_match`/`date_plausible`/`e2e_reuse`) já
  cobre os casos de fraude mais óbvios (DECISIONS.md [29]); o resto é
  reforço, não bloqueador.
- Segundo provedor de VLM — "só OCR por enquanto", decisão [18], ainda
  vale: revisão humana no lugar de VLM é mais lento, não inseguro.
- Painel de superadmin completo (quebra-vidro, impersonação, feature
  flags, MFA do admin) — só importa na escala de vários clientes;
  com um único tenant real, o acesso `x-admin-secret` atual é
  suficiente.

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

**Fase 4 parcial — cota real, custo de IA por tenant, cobrança via
AbacatePay concluída em 18/08/2026** (DECISIONS.md [25]): `enforceQuota`
agora roda de verdade no webhook/worker de comprovante (rejeita sem
processar quando `receipts_per_month` é excedido); painel de admin
mostra custo de IA real por tenant (R$0,00 enquanto VLM continuar fora
do roadmap, decisão [18]); `essential`/`professional` têm assinatura
PIX real via AbacatePay (webhook, `/t/<slug>/account`), verificado ao
vivo contra a API de dev. `free`/`scale` continuam fora do checkout
automático, por decisão do usuário.

**Cron de renovação de assinatura concluído em 18/08/2026**
(DECISIONS.md [26]): fecha a pendência que a decisão [25] deixou
registrada — sem ele, "assinar" funcionava mas nada renovava sozinho.
Job BullMQ diário reaproveita `subscribeTenant` para gerar a cobrança
do próximo ciclo (ou finaliza cancelamento, se `cancel_at` já passou),
com duas guardas independentes contra reencaminhar a mesma cobrança em
dias seguintes. Verificado ao vivo contra o tenant de teste da decisão
[25].

**Fechamento do resto da Fase 4 (dunning + histórico de faturas)
concluído em 19/08/2026** (DECISIONS.md [27]/[28]): as duas pendências
que a decisão [26] deixou registradas. Dunning — tenant em `past_due`
há 7 dias ou mais (decisão do usuário) é suspenso automaticamente pelo
mesmo cron de renovação, ancorado em `subscriptions.currentPeriodEnd`
(sem coluna nova) e protegido contra repetir a suspensão pela própria
validade da transição de estado — sem isso, um tenant que nunca pagasse
ficaria `past_due` pra sempre. Histórico de faturas — tabela nova
`invoices` (RLS desde a criação, isolamento testado contra Postgres
real), uma linha por cobrança PIX gerada por `subscribeTenant`,
atualizada pelo webhook e exibida em `/t/<slug>/account`.

**Fase 5 (fatia 1) — módulo `fraud`, `fraud_checks`, `risk_score`
concluído em 19/08/2026** (DECISIONS.md [29]): fecha a decisão [17]
("risco/fraude é no-op documentado") consolidando o que já existia
espalhado no código — `amount_match`/`date_plausible` (já eram gates
duros em `decideAutoApply`, agora também auditados por check) e
`e2e_reuse` (antes só pego reativamente por violação de índice único,
agora checado proativamente antes de decidir). Novo módulo
`src/modules/fraud/`, tabela `fraud_checks` (RLS desde a criação),
`reconciliation_proposals.risk_score` finalmente populado. Fila de
revisão (`/t/<slug>/review`) mostra o risco e as checagens ao revisor
humano. `DUPLICATE_HASH`/`NEAR_DUPLICATE` continuam fora deste módulo —
são rejeitados antes de existir `receiptId` pra referenciar, design do
Marco 5. Achado lateral corrigido junto: `reconciliation_proposals`
tinha RLS desde o Marco 4 mas nunca tinha sido testada contra Postgres
vivo — `tests/security/tenant-isolation-fraud.test.ts` fecha essa
lacuna e a de `fraud_checks` ao mesmo tempo. Resto da Fase 5 (checks
forenses, Camada C comportamental, conciliação por extrato) segue como
próxima fatia, não pedida ainda.

**Fase 5 (fatia 2) — conciliação por extrato concluída em 19/08/2026**
(DECISIONS.md [32]): a spec chama isso de "o melhor custo-benefício do
projeto inteiro" — importar extrato CSV, casar cada linha de crédito
pelo E2E ID extraído da descrição contra um pagamento existente, subir
`verification_level` pra `statement`. Novo módulo `src/modules/
statements/`, tabelas `statement_imports`/`statement_lines` (RLS desde
a criação), telas `/t/<slug>/statements`. Linha sem match nunca cria
pagamento sozinha — fica visível pra um humano escolher pagador/
contrato e registrar a partir dela (`payments.origin/verification_
level = "statement"`). Escopo desta fatia: só CSV (sem OFX/CNAB), match
só por E2E (sem valor+data), sem sweep retroativo. Antes de começar,
achado e corrigido um gap de RBAC maior do que o previsto — ver
DECISIONS.md [30]/[31].

**Provedor de e-mail real (Resend) + "esqueci minha senha" concluído
em 19/08/2026** (DECISIONS.md [33]): `src/shared/email.ts` (cliente
Resend sem SDK) ligado em `sendWelcomeEmail`/`sendInviteEmail`, que
antes só logavam o link. "Esqueci minha senha" construído do zero
(mirror de convite): tabela `password_reset_tokens`, telas
`/forgot-password`/`/reset-password/<token>`, invalida toda sessão
existente do usuário ao resetar. **Sem conta Resend criada ainda** —
implementado contra a API pública documentada, verificado ao vivo
contra Postgres real com o envio de e-mail injetado (não a Resend de
verdade). Pendência real: falta a chave de API pra validar
`sendEmail` contra a rede de verdade.

**Editar/desativar pagador, editar/cancelar contrato concluído em
19/08/2026** (DECISIONS.md [34]): Marco 3 só tinha criar+ler. Editar é
só metadado (nunca os campos estruturais que já geraram o cronograma
de parcelas); "excluir" nunca é `DELETE` — pagador desativa/reativa,
contrato cancela (e cancela as parcelas ainda não pagas junto, parcela
paga é fato histórico, nunca tocada).

**`docs/adr/` e `docs/tasks/` criados em 19/08/2026** (tarefa de
documentação, sem mudança de código — `pnpm check` não se aplica): os
14 ADRs canônicos da spec §17, e a estrutura `docs/tasks/fase-0/` a
`fase-8/` com specs de escopo fechado para o trabalho futuro já
identificado. Fecha o link morto de `src/shared/money.ts` para
`docs/adr/0003-...md`. Ver "Pendências conhecidas" para o que ficou
fora (fatiação de `docs/spec/`, link morto de `document.ts`).

**Fase 5 — Camada C (comportamento) concluída em 19/08/2026**
(`docs/tasks/fase-5/02-camada-c-comportamento.md`, DECISIONS.md [35]):
os 4 checks que faltavam no módulo `fraud` — `velocity` (rajada de
comprovantes fora do padrão histórico do pagador), `history` (pagador
sem nenhum pagamento aceito antes enviando valor muito acima da média
das próprias parcelas), `amount_pattern` (mesmo valor exato
reaproveitado por ≥3 pagadores diferentes) e `phone_change` (telefone
de origem diferente do cadastrado, quando a identificação não foi por
telefone — cenário C-18 da spec). Escolhida em vez da Camada A/B
forense por não exigir dependência nova nem schema novo. Os 4 produzem
`result: "warn"` (nunca `"fail"`) e somam ao `risk_score` por um pool
de peso próprio, limitado a 30 pontos mesmo com os 4 disparando juntos
— nunca ultrapassam sozinhos o limiar que bloqueia auto-aplicação, e
nunca entram em `FORCES_REVIEW`. `fraud/domain/behavior.ts` (puro, 15
testes) + `fraud/infra/behavior-repository.ts` (agregados buscados na
mesma transação de `executeReceiptPaymentTx`, sem tabela nova).
`ReceiptPaymentInput` ganhou `fromPhone`/`payerPhoneE164`, repassados
por `process-receipt-extraction.ts` — antes descartados depois da
identificação do pagador. 26 testes novos/alterados em
`fraud/domain/{behavior,evaluate}.test.ts` (exemplo + propriedade,
fast-check), `pnpm exec tsc --noEmit`/`pnpm exec eslint` limpos.
**Verificação manual ponta a ponta contra Postgres real não foi feita**
— Docker Desktop não estava disponível no ambiente onde a tarefa foi
executada; pendência registrada abaixo, não escondida.

**MFA (TOTP) para owner/admin concluído em 19/08/2026**
(`docs/tasks/fase-0/01-mfa-owner-admin.md`, DECISIONS.md [36]): a
única lacuna de segurança da spec §10.2 adiada desde o Marco 2
(decisão [15]). Ativação em duas etapas — segredo gerado e cifrado
(AES-256-GCM local sobre `ENCRYPTION_KEY`, `src/shared/crypto.ts`,
novo) fica pendente até o usuário confirmar o código do momento; só
então `mfaEnabled` vira `true` e 10 códigos de recuperação são
mostrados em claro uma única vez. TOTP (RFC 6238/4226) é hand-rolled
com `node:crypto` — validado contra o vetor de teste oficial da RFC
4226 Apêndice D —, QR code usa a dependência nova `qrcode`. Login com
MFA ativo passa por um challenge stateless (`identity/domain/
mfa-challenge.ts`, mesmo padrão HMAC de `deriveCsrfToken`, sem tabela
nova) antes de criar sessão — `POST /api/auth/login` devolve
`mfaRequired`, `POST /api/auth/mfa-verify` (novo, rate-limited)
confirma o código (TOTP ou recuperação) e só aí abre a sessão. Nova
tela `/account/security` (fora de `/t/<slug>/`, propositalmente — MFA
é do usuário, não do tenant), link "Segurança" no nav de todo tenant.
**Escopo é só o mecanismo — nenhuma conta owner/admin existente é
forçada a ativar** (decisão do usuário, evita bloquear login sem
aviso). 351 testes (unidade + propriedade) passam, `pnpm exec tsc
--noEmit`/`pnpm exec eslint` limpos. **Verificado ao vivo contra
Postgres real ainda no mesmo dia** (Docker ficou disponível): migração
`0021_flowery_riptide.sql` aplicada, e um roteiro de 13 passos rodado
via script descartável contra os módulos reais — criar usuário, login
sem MFA (sessão direta), ativar MFA (código errado rejeitado, código
certo ativa + gera 10 códigos de recuperação), login com MFA (challenge
em vez de sessão), TOTP errado rejeitado/certo cria sessão, código de
recuperação funciona uma vez (segunda tentativa do mesmo código falha
— consumo atômico confirmado contra banco real), desativar com senha
errada falha/certa funciona, login volta a criar sessão direto. Todos
os passos passaram de primeira.

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
- **Cobrança via AbacatePay** (`billing`, Fase 4 parcial, DECISIONS.md
  [25]): `subscribeTenant` chamado contra a API de dev real duas vezes
  no mesmo tenant (essential, depois professional) — produto criado e
  persistido em `plans.abacate_pay_product_id` nas duas vezes, cliente
  AbacatePay criado só na primeira e reaproveitado na segunda
  (`tenants.billing_customer_ref` inalterado). Webhook
  `api/webhooks/abacatepay` testado com payload `checkout.completed`
  assinado com HMAC real contra um segredo de teste: tenant
  `trial→active`, `subscriptions` criada com `provider_ref`/período
  corretos. Também testado: assinatura inválida (400), segredo não
  configurado (500), evento fora do mapa (200 `ignored_event`),
  metadata ausente e tenant inexistente (500 nos dois).
  `/t/<slug>/account` renderizado via `next dev` real (signup → conta
  nova → planos com preço do banco → formulário de telefone/CPF-CNPJ
  só na primeira assinatura). Segredo real do webhook (painel da
  AbacatePay) e round-trip HTTP fim-a-fim contra tráfego real da
  AbacatePay continuam pendentes — dependem de um passo manual do
  usuário (ver "Pendências conhecidas").
- **Cron de renovação** (`billing/application/renew-subscriptions.ts`,
  DECISIONS.md [26]): forcei `current_period_end` do tenant de teste
  acima para o passado e rodei o job real (não mock) — gerou cobrança
  nova na AbacatePay (dev), tenant e `subscriptions` foram para
  `past_due` nos dois. Rodei de novo sem mudar nada: `skipped`, nenhuma
  chamada nova à AbacatePay (as duas guardas seguraram — nunca cobra
  duplicado). Com `cancel_at` no passado: tenant e `subscriptions`
  foram para `cancelled`, sem nenhuma cobrança criada.
- **Dunning + histórico de faturas** (DECISIONS.md [27]/[28]): assinei
  `essential` num tenant de teste contra a AbacatePay de dev real —
  fatura `pending` gravada com o `providerRef` do checkout; simulei o
  webhook `checkout.completed` chamando `handleBillingWebhook`
  diretamente (sem passar pela verificação de assinatura HTTP do
  endpoint, fora do escopo desta verificação específica) — fatura virou
  `paid` com `paidAt`, tenant virou `active`. Forcei `currentPeriodEnd`
  8 dias no passado com `subscriptions.status = "past_due"` e rodei
  `renewDueSubscriptions` real: tenant e sessão foram para `suspended`,
  `tenants.suspended_at` preenchido. Rodei de novo sem mudar nada:
  `skipped`, nenhuma suspensão repetida (guarda de idempotência pela
  validade da transição). Isolamento cross-tenant de `invoices` testado
  contra Postgres real junto com o resto de `tenants.ts`
  (`tests/security/tenant-isolation-tenancy.test.ts`).

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
- **Fatia de camada SaaS (equivalente a parte da Fase 4) — cota real
  e faturamento via AbacatePay em 18/08/2026 (DECISIONS.md [25]):**
  `billing/infra/usage-repository.ts` liga `enforceQuota` de verdade ao
  webhook/worker de comprovante; `billing/infra/abacatepay-client.ts` +
  `application/{subscribe-tenant,handle-billing-webhook,cancel-
  subscription}.ts` dão assinatura PIX real (`essential`/
  `professional`) via `/t/<slug>/account` e `api/webhooks/abacatepay`.
  `billing/application/renew-subscriptions.ts` (DECISIONS.md [26],
  job BullMQ diário) gera a cobrança do próximo ciclo sozinho ou
  finaliza o cancelamento, reaproveitando `subscribeTenant`. `admin`
  ganhou conexão real em 18/08/2026 (`src/app/admin/_lib/queries.ts`,
  DECISIONS.md [24]) — dashboard, lista de tenants e custo de IA por
  tenant, escopo mínimo, sem quebra-vidro/MFA/subdomínio.
  `identity`/`tenant` deixaram de ser só domínio puro — Marco 2 deu
  infra real e onboarding self-service funciona (signup → tenant +
  owner + login). Falta UI de faturas, dunning após `past_due`
  prolongado e quebra-vidro auditado no painel de superadmin.
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
  risco/fraude de verdade (Fase 5 — parcial desde 19/08/2026, ver
  DECISIONS.md [29]).

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
- **`review/actions.ts` (fila de revisão) nunca checava
  `requirePermission`** — qualquer membro do tenant, inclusive `viewer`,
  conseguia aprovar/rejeitar proposta e aplicar pagamento real por essa
  Server Action. Achado investigando a fila de revisão antes de planejar
  a conciliação por extrato. **Corrigido em 19/08/2026** — ver
  DECISIONS.md [30] (`receipts:approve`, já existia em
  `ROLE_PERMISSIONS` desde a fundação, nunca tinha sido ligado).
- **Mesmo gap, escopo maior: `contracts/actions.ts`/`payers/actions.ts`
  nunca checavam `requirePermission`** — criar pagador, criar contrato,
  registrar pagamento manual e reverter pagamento, tudo sem checagem de
  papel. **Corrigido em 19/08/2026** — ver DECISIONS.md [31]
  (`contracts:write`/`payments:write`). Pendência registrada: uma
  auditoria única de todas as Server Actions do projeto pra confirmar
  que não existe uma quinta ação no mesmo estado não foi feita, só as
  encontradas nesta investigação.
- **Somar os pesos de Camada C direto em `CHECK_WEIGHTS` (Fase 5,
  DECISIONS.md [35]) diluía silenciosamente o score de Camada A/B** —
  achado pelo próprio `evaluate.test.ts` já existente antes de chegar
  em produção: `amount_match` + `date_plausible` falhando juntos
  deixou de ultrapassar `DEFAULT_RISK_SCORE_THRESHOLD` sozinho, porque
  o denominador (`TOTAL_WEIGHT`) cresceu com os pesos novos.
  Corrigido: Camada C ganhou pool de peso próprio
  (`BEHAVIORAL_CHECK_WEIGHTS`), somado como incremento aditivo e
  limitado (`BEHAVIORAL_MAX_CONTRIBUTION`) ao score de Camada A/B, que
  passou a manter exatamente o cálculo de antes desta fatia.

## Em andamento

- **Ingestão e extração** (`src/modules/ingestion/`): Tier 0
  (quase-duplicata por hash perceptual) e Tier 1 (PDF real) fechados no
  Marco 5. VLM (Tier 3, `infra/anthropic-vlm.ts`) existe no código mas
  não está plugado no worker — por decisão do usuário, não falta técnica
  (DECISIONS.md [18]): todo comprovante que Tier 1/2 não resolverem cai
  em revisão humana, sem escalar a nenhum modelo.
- **UI real do produto — funcional, mas visualmente muito abaixo do
  esperado.** As 21 páginas que existem hoje (`login`/`signup`/
  `forgot-password`/`reset-password`/`invite`, `admin/{page,tenants}`,
  e todo `/t/<slug>/{contracts,payers,review,statements,account}` com
  seus `new`/`edit`/detalhe) funcionam ponta a ponta contra o banco
  real, mas são formulário/tabela HTML crus — nenhuma delas aplica de
  verdade a hierarquia canvas→panel→card, a escala tipográfica binária
  ou a disciplina de zero-cor-semântica da spec §13.2/§13.1. Os
  primitivos existem (`src/ui/components/{Button,Card,Eyebrow,Field,
  Input,Money,StatusChip,ErrorNote}.tsx`, tokens em
  `design/quitou.tokens.json`/`quitou.theme.css`) mas boa parte das
  telas não os usa, ou usa parcialmente — não é falta de fundação de
  design, é falta de aplicar a fundação que já existe. Além disso, 4
  telas da spec não existem: Painel (dashboard do tenant — hoje não há
  nenhuma página em `/t/<slug>/` além das listadas), Comprovantes
  (visualização de recibo fora da fila de revisão), Configurações,
  e uma versão completa de Conta (hoje só cobre plano/cobrança).
  Ver "O que falta para lançar um MVP" — isso é risco de adoção real
  pro primeiro cliente, não só débito técnico.
- ~~**Sem edição/exclusão de pagador ou contrato**~~ — **resolvido em
  19/08/2026** (DECISIONS.md [34]). Editar é metadado (nome/documento/
  telefone pra pagador; descrição/referência externa pra contrato —
  nunca os campos estruturais que já geraram o cronograma). "Excluir"
  nunca é `DELETE`: pagador desativa/reativa (`payers.status`),
  contrato cancela (`contracts.status` + cancela parcelas ainda não
  pagas, parcela paga nunca é tocada).
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

- **Fase 5 — Camada C (comportamento) sem verificação ao vivo contra
  Postgres real** (DECISIONS.md [35], 19/08/2026): implementação e os
  26 testes de domínio (fixture controlada, `fraud/domain/{behavior,
  evaluate}.test.ts`) passam limpos, mas o passo de "criar pagador com
  histórico controlado e conferir `fraud_checks`/`risk_score` reais"
  que todo marco anterior fez não rodou desta vez — Docker Desktop não
  estava disponível no ambiente de execução. Baixo risco (lógica é
  toda pura e testada, agregados de infra seguem o mesmo padrão já
  verificado de `fraud-check-repository.ts`), mas fica registrado até
  alguém confirmar contra o banco real.
- ~~**MFA não implementado**~~ — **implementado e verificado ao vivo
  em 19/08/2026** (DECISIONS.md [36]). Docker ficou disponível ainda
  no mesmo dia; migração `0021_flowery_riptide.sql` aplicada e os 13
  passos do roteiro de verificação (ativar, login com/sem código,
  código errado, código de recuperação uso único, desativar com senha
  errada/certa) passaram contra Postgres real. Opt-in por decisão do
  usuário: o mecanismo está pronto pra qualquer conta, mas nenhuma
  conta owner/admin é forçada a ativar ainda — ver "Próximo passo
  sugerido" no topo deste arquivo.
- ~~**Nenhum provedor de e-mail real configurado**~~ / ~~**Sem "esqueci
  minha senha"**~~ — **resolvidos em 19/08/2026** (DECISIONS.md [33]).
  `src/shared/email.ts` (Resend, sem SDK) ligado em `sendWelcomeEmail`/
  `sendInviteEmail`; reset de senha completo (`/forgot-password`,
  `/reset-password/<token>`). **Ainda pendente:** conta Resend não foi
  criada — `sendEmail` nunca rodou contra a API de verdade, só
  verificado com o envio injetado/capturado. Verificação de e-mail no
  cadastro (spec, plano grátis) e templates de e-mail com o design
  system continuam fora, não pedidos ainda.
- ~~**`docs/adr/` não existe.**~~ — **resolvido em 19/08/2026.** Os 14
  ADRs canônicos da spec §17 (`docs/adr/0001-...md` a `0014-...md`)
  criados a partir de `DECISIONS.md`/CLAUDE.md/schema — cada um traz
  contexto, decisão e status real (alguns marcados explicitamente
  "aceito como arquitetura-alvo, não implementado ainda", ex.:
  ADR-0006 número de WhatsApp por tenant, ADR-0007 opt-out de IA).
  `src/shared/money.ts` referenciava `docs/adr/0003-money-as-integer-
  cents.md` como link morto — agora resolve. **Ainda pendente:**
  `src/shared/document.ts` referencia `docs/spec/05-data-model.md`,
  que continua sem existir — a fatiação da spec inteira em
  `docs/spec/` ficou fora de escopo desta rodada, por decisão do
  usuário (só os 14 ADRs foram pedidos).
- ~~**`docs/tasks/` não existe.**~~ — **resolvido em 19/08/2026.**
  Estrutura `docs/tasks/fase-0/` a `fase-8/` criada, com specs de
  escopo fechado (Objetivo/Critérios de aceite/Fora de escopo) para o
  trabalho futuro já identificado nesta sessão: MFA (fase-0), cifra de
  coluna documento/telefone (fase-0), `early_payment_policy:
  "reduce_amount"` real (fase-1), segundo provedor de VLM (fase-2),
  resto do painel de superadmin (fase-4), checks forenses Camada A/B
  e Camada C comportamental (fase-5). Escopo desta rodada foi
  deliberadamente "estrutura + tarefas futuras já conhecidas", não
  fatiar a spec inteira em tarefas.
- **4 tabelas citadas na spec ainda não existem no schema**: `api_keys`,
  `webhook_endpoints`, `webhook_deliveries`, `idempotency_keys`
  (`reconciliation_proposals` existe desde o Marco 4, 18/08/2026;
  `fraud_checks` existe desde a Fase 5 fatia 1, 19/08/2026, DECISIONS.md
  [29]). Sem as 4 restantes, a API pública não tem onde persistir — mas
  `idempotency_keys` provavelmente nunca precisa existir para o dedupe
  de webhook WhatsApp, que já usa `inbound_messages.provider_message_id`
  (ver DECISIONS.md [1], nota de 18/08); ela é relevante só para a API
  pública da Fase 7.
- **Módulos da spec ainda sem pasta**: `charges`, `psp` (`payers`,
  `contracts`, `ledger`, `reconciliation` existem desde o Marco 1,
  18/08/2026; `fraud` existe desde a Fase 5 fatia 1, 19/08/2026).
- ~~**`src/shared/crypto.ts` não existe.**~~ — **resolvido em
  19/08/2026** (DECISIONS.md [36]): AES-256-GCM local sobre
  `ENCRYPTION_KEY`, criado pra cifrar o segredo TOTP do MFA, genérico
  o bastante pra qualquer outro segredo pequeno que precise do mesmo
  "cofre local" no futuro. **`src/shared/errors.ts` continua não
  existindo** — ainda não há criptografia de COLUNA para documento/
  telefone do pagador (`docs/tasks/fase-0/02-...md`, escopo diferente:
  aquilo é uma coluna de banco cifrada por linha, não um segredo único
  como o do MFA). (`logger.ts` existe desde o Marco 6, DECISIONS.md
  [21] — cobertura parcial, só processos de produção contínua;
  `storage.ts` já existe, em v1 mínima — ver DECISIONS.md [7].)
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
- **AbacatePay — segredo real do webhook pendente** (DECISIONS.md
  [25]): `ABACATE_PAY_WEBHOOK_SECRET` segue vazio em `.env`/
  `.env.example`. Depende de um passo manual do usuário: criar o
  webhook no painel da AbacatePay (ambiente dev) apontando para um
  túnel ngrok (`NGROK_AUTH_TOKEN` já está no `.env`) e informar o
  segredo gerado. Sem isso, a verificação de assinatura e a lógica de
  transição foram testadas com um segredo fake e payload sintético
  assinado manualmente — não o round-trip HTTP real vindo da
  AbacatePay.
- **Renovação automática (DECISIONS.md [26]) e dunning (DECISIONS.md
  [27]) implementados.** O cron gera a cobrança do próximo ciclo, marca
  o tenant `past_due` e, se ele continuar assim por 7 dias (decisão do
  usuário) sem pagar, suspende automaticamente
  (`transition("past_due", "payment_overdue")`, `tenants.suspended_at`
  preenchido). Ainda pendente: detectar cobrança expirada sem esperar o
  próximo ciclo via webhook (`GET /billing/list` ou equivalente) segue
  sem confirmação empírica.
- **`createProduct` não é idempotente contra "produto já existe" na
  AbacatePay** — achado durante a verificação da Fase 4 parcial
  (DECISIONS.md [25]): se uma tentativa anterior criar o produto na
  AbacatePay mas falhar antes de persistir `plans.abacate_pay_
  product_id`, toda assinatura futura desse plano fica bloqueada até
  correção manual da coluna. Não corrigido — fora do escopo combinado
  com o usuário para esta tarefa.
- ~~**Sem UI de faturas/histórico de cobrança**~~ — **resolvido em
  19/08/2026** (DECISIONS.md [28]). Tabela nova `invoices` (RLS desde a
  criação), uma linha por cobrança PIX gerada; `/t/<slug>/account` ganhou
  o card "Histórico de cobrança" (data, plano, valor, status).
- **Fora de escopo do Marco 4, deliberadamente:** item 4 do §6.3
  (referência externa tipo "CTR-00432" na mensagem do PIX —
  `ExtractionOutput` não tem esse campo, adicioná-lo mudaria o contrato
  de extração inteiro); "mensagem fora de ordem" (DoD da Fase 3).
  ~~Risco/fraude de verdade (§6.6 — Fase 5)~~ — **parcial desde
  19/08/2026, ampliada no mesmo dia** (DECISIONS.md [29]/[32]/[35]):
  `amount_match`/`date_plausible`/`e2e_reuse` (Camada A/B) e
  `velocity`/`history`/`amount_pattern`/`phone_change` (Camada C) via
  módulo `fraud`, `reconciliation_proposals.risk_score` populado;
  conciliação por extrato (Camada D) também concluída. Só falta Camada
  A/B forense (`PAYEE_MATCH`/`E2E_FORMAT`/`INSTITUTION_KNOWN`/
  `LAYOUT_KNOWN`/`EXIF_ANOMALY`/`PDF_PROVENANCE`/`ELA_HINT`/
  `FONT_ANOMALY`, `docs/tasks/fase-5/01-...md`) — depende de dado novo
  (beneficiário esperado por tenant) e de uma dependência nova pra
  forense de imagem/PDF, nenhuma das duas decidida ainda.
  `field_confidence` também segue nunca
  populado por nenhum tier hoje (nem determinístico nem OCR preenchem
  por campo), então a checagem "nenhum campo crítico abaixo de 0,85"
  do §6.6 só entra em ação quando um tier futuro (VLM) começar a
  preencher essa chave — hoje é um no-op silencioso, não uma lacuna de
  segurança (a confiança geral, que já pondera divergência entre
  tiers, é o proxy disponível).
- ~~**Auditoria completa de `requirePermission` em todas as Server
  Actions não foi feita.**~~ — **fechada em 19/08/2026.** `grep -rl
  '"use server"' src/app` lista só 6 arquivos: `account`/`contracts`/
  `payers`/`review`/`statements` `actions.ts` (todos com
  `requirePermission` desde as decisões [30]/[31]/[32]) e
  `layout.tsx` (só `logoutAction`, que não precisa de permissão —
  sessão válida já basta pra logout). Nenhuma quinta ação pendente.
  Rotas de API (`webhooks`, `/api/team/invite`) são um mecanismo
  diferente, fora desta varredura — `/api/team/invite` já tinha seu
  próprio fix na decisão [22].
