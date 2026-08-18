# Decisões técnicas — Parciva

Registro das decisões arquiteturais tomadas até agora. Baseado em
`docs/quitou-spec.md` (v1.0, 11 de agosto de 2026), `docs/quitou-setup.md` e no
estado real do código em `src/`. Este arquivo é o substituto provisório de
`docs/adr/`, que a spec recomenda (§17) mas que ainda não foi criado como
pasta de ADRs individuais — o número entre colchetes corresponde à ordem de
decisão listada em `docs/quitou-spec.md` §17 quando aplicável.

---

## [1] RLS em banco único para multi-tenancy

**Data:** Agosto 2026 (spec v1.0, §4.1; implementado em `0bd9205`, 17/08/2026)

**Contexto:** O produto precisa isolar dados de múltiplos tenants com um time
de uma pessoa e sem orçamento para infraestrutura por cliente. Vazamento
cross-tenant é o pior bug possível do produto — dado financeiro de uma
empresa aparecendo para outra.

**Decisão:** Banco único, schema único, isolamento por `tenant_id` + Row Level
Security no Postgres, com defesa em profundidade em 4 camadas: (1) RLS com
`FORCE ROW LEVEL SECURITY` no banco, (2) `TenantContext` obrigatório em
`src/db/client.ts` na aplicação, (3) suite de testes de vazamento cross-tenant
no CI, (4) caminho de storage sempre prefixado por `tenant_id`. A migração
`src/db/migrations/0001_rls.sql` já aplica `ENABLE ROW LEVEL SECURITY` +
`FORCE ROW LEVEL SECURITY` + policy `tenant_isolation` em 13 tabelas de
domínio (`memberships`, `subscriptions`, `usage_counters`, `audit_logs`,
`payers`, `contracts`, `installments`, `payments`, `payment_allocations`,
`credit_balances`, `psp_connections`, `charges`, `charge_installments`,
`ledger_entries`). `tenants`, `users` e `plans` ficam de fora por design
(tabelas raiz/globais).

**Alternativas descartadas:** Schema-por-tenant (custo operacional de
migração cresce linearmente com o número de clientes) e banco-por-tenant
(inviável para plano grátis e para um único desenvolvedor operar).

**Consequências:** RLS precisa estar ativo desde o primeiro schema — retrofit
depois é uma das refatorações mais caras e arriscadas que existem (armadilha
explícita da Fase 0 na spec). Se algum dia um cliente enterprise exigir
isolamento físico, a resposta é deploy dedicado, não mudar a arquitetura
base.

**Atualização (18/08/2026):** `tests/security/tenant-isolation.test.ts`
agora existe e roda contra Postgres vivo (`script test:tenant`) — e, na
primeira execução, pegou um bug real: a policy estava sendo ignorada
porque o único role do banco de dev era superusuário. Ver decisão [13]
para o porquê e a correção. `0004_ingestion_rls.sql` estendeu a mesma
policy `tenant_isolation` para `receipts`, `receipt_extractions` e
`inbound_messages` — `whatsapp_channels` ficou fora de propósito (é
tabela raiz, mesmo motivo de `tenants`/`users`/`plans`, ver
`src/db/schema/ingestion.ts`). Pendência que continua real: o teste
cobre só as tabelas novas dessa tarefa — as 13 tabelas de domínio
originais desta decisão ainda não têm teste de isolamento próprio.

---

## [2] Ledger append-only

**Data:** Agosto 2026 (spec v1.0, §5.5; trigger implementado em `0bd9205`)

**Contexto:** O ledger é a fonte da verdade de todo o dinheiro do sistema.
Precisa ser auditável, reproduzível (mesma entrada + mesma versão de regra =
mesmo resultado) e resistente a correção silenciosa — inclusive por quem tem
acesso direto ao banco.

**Decisão:** `ledger_entries` nunca recebe `UPDATE` nem `DELETE`. Toda
correção é um novo lançamento de reversão, referenciando o original via
`reverses_entry_id`. Isso é protegido por trigger no banco
(`src/db/migrations/0002_ledger_trigger.sql`): a função
`forbid_ledger_mutation()` levanta exceção em qualquer `UPDATE`/`DELETE` na
tabela, via trigger `ledger_no_update BEFORE UPDATE OR DELETE`.

**Alternativas descartadas:** Confiar só na disciplina do código de
aplicação (rejeitado explicitamente — "não confie só na disciplina do
código", CLAUDE.md invariante 2); soft-delete com flag de status (não
resolve o problema de correção silenciosa de valor).

**Consequências:** Toda disputa de cliente ("vocês baixaram errado há 6
meses") é resolvida por replay do ledger, não por confiança na memória de
alguém. Em contrapartida, nenhum código de aplicação pode assumir que pode
"consertar" um lançamento — precisa sempre modelar como reversão + novo
lançamento.

**Atualização (18/08/2026):** `src/modules/ledger/` agora existe e escreve
de verdade (`writeEntry`/`writeEntryTx`, usado por
`reconciliation/infra/payment-repository.ts`). A proteção foi confirmada
na prática, não só na teoria: uma tentativa de `DELETE` manual para
limpar dados de verificação de teste foi bloqueada pela trigger
(`ledger_entries é append-only (tentativa de DELETE)`) — o comportamento
esperado, mesmo incomodando a limpeza de dev. Ver decisão [14] para a
convenção de `direction`/`entry_type` usada pelo motor de alocação.

---

## [3] Dinheiro em centavos inteiros

**Data:** Agosto 2026 (spec v1.0, §3.3 e §7.4; implementado em `0bd9205`)

**Contexto:** Erros de ponto flutuante em valores monetários (`0.1 + 0.2 !==
0.3`) são inaceitáveis num sistema que decide se uma parcela foi quitada.

**Decisão:** Todo valor monetário é um inteiro em centavos, nunca `float` nem
`decimal` em JS/TS. Implementado como branded type `Money` em
`src/shared/money.ts`: `type Money = number & { readonly [brand]: "Money" }`,
construído só via `money(cents)`, que lança `MoneyError` se o valor não for
inteiro finito. O tipo tem operações próprias (`add`, `subtract`, `sum`,
`min`, `max`, `isNegative`, `isZero`, `fromReais`, `toDisplayReais`) e testes
em `money.test.ts`.

**Alternativas descartadas:** `Decimal`/`BigNumber` de biblioteca externa
(overhead desnecessário quando centavos inteiros já resolvem); `number` cru
sem branding (não impede erro de tipo — um `number` qualquer passaria por
dinheiro sem validação).

**Consequências:** O compilador recusa qualquer `number` não validado por
`money()` em contexto de dinheiro — a regra não depende de ninguém lembrar
dela. Toda extração de valor (§7.4 da spec) também é forçada a produzir
inteiro em centavos, nunca formato ambíguo. `src/shared/money.ts` referencia
`docs/adr/0003-money-as-integer-cents.md`, que ainda não existe como arquivo
— pendência a resolver quando `docs/adr/` for criado.

---

## [4] Cascata determinístico-primeiro para extração

**Data:** Agosto 2026 (spec v1.0, §7.1; parcialmente implementado em
`0bd9205`)

**Contexto:** Comprovante de PIX brasileiro é altamente estruturado. Tratar
extração como "problema de IA" desde o primeiro tier significa pagar caro
(tokens de VLM) por algo que regex resolve, e depender de disponibilidade de
provedor externo para o caminho mais comum.

**Decisão:** Cascata de 6 tiers, cada um só chamado se o anterior falhar ou
tiver confiança insuficiente: (0) cache por `content_hash`/`perceptual_hash`,
(1) PDF com camada de texto + regex, (1.5) QR/BR Code, (2) OCR local
(Tesseract) + regex, (3) VLM barato, (4) VLM premium, (5) revisão humana.
Hoje implementado em `src/modules/ingestion/domain/pipeline.ts`:
`deterministic-extractor.ts` (regex — E2E ID, valor, data, CPF/CNPJ
mascarado) roda antes de `infra/tesseract-ocr.ts` (Tier 2, real, usado pelo
worker), que por sua vez precede `infra/anthropic-vlm.ts` (Tier 3, existe no
código mas ainda não é chamado pelo worker em produção).

**Alternativas descartadas:** Enviar toda imagem direto para VLM (mais
simples de implementar, mas caro e cria dependência total de provedor
externo — risco R-02 e R-22 da spec).

**Consequências:** Corpus de teste versionado com comprovantes reais
anonimizados vira o ativo técnico mais valioso do projeto (ainda não
existe — nenhum diretório `corpus/` no repositório hoje).

**Atualização (18/08/2026):** `receipt_extractions` existe no schema desde
`0003_gigantic_true_believers.sql` e o worker (`receipt-worker.ts`) grava
nela de verdade (`tier`, `data`, `field_confidence`, `overall_confidence`)
— não é mais só `console.log`. `cost_micros`/`input_tokens`/`output_tokens`
continuam `NULL` porque nada além de OCR local roda em produção ainda (sem
custo de token a registrar); passam a ser preenchidos quando VLM (Tier 3)
for de fato plugado no worker. `runDeterministicExtraction` também deixou
de ser stub — o worker chama `extractFromText` real.

---

## [5] Rótulo "conferido" em vez de "confirmado"

**Data:** Agosto 2026 (spec v1.0, §8.3)

**Contexto:** Nas Fases 1–5 (modelo A), nenhuma baixa tem confirmação
bancária real — é sempre inferida de um documento. Usar a palavra
"confirmado" na UI ou em material comercial antes de haver confirmação real
do PSP é risco jurídico e destrói a confiança do cliente no primeiro caso de
fraude que passar.

**Decisão:** `payments.verification_level` é campo de produto, não só
técnico, com 4 níveis (`unverified`, `document`, `statement`,
`psp_confirmed`) e rótulo de UI correspondente. Só `psp_confirmed`
(confirmação real pelo PSP, modelo B, Fase 6) autoriza a palavra
"confirmado". Nas fases atuais, o rótulo correto é "Comprovante conferido —
sem divergências detectadas". O nível sobe, nunca desce (constraint de
domínio, §5.5 da spec).

**Alternativas descartadas:** Usar "confirmado" genericamente desde já (mais
simples para copy de produto, mas falso — e juridicamente perigoso);
esconder o nível de verificação do usuário final (contraria a comunicação
honesta que a spec exige como princípio de produto).

**Consequências:** Toda tela e todo texto de produto que mencione um
pagamento processado por comprovante precisa checar `verification_level`
antes de escolher a palavra. `StatusChip` (`src/ui/components/`) é o
componente central onde essa regra deveria ficar codificada — hoje o
componente existe, mas os rótulos "conferido"/"confirmado" ainda não estão
conectados a nenhum fluxo real de pagamento, porque `payments` ainda não é
escrito por nenhum caso de uso.

---

## [6] Twilio como BSP do WhatsApp

**Data:** Agosto 2026 (spec v1.0, §9.1; implementado em `f533aa3`, 13/08/2026)

**Contexto:** A spec recomendava WhatsApp Business Cloud API oficial (Meta)
direto ou via um BSP (360dialog, Twilio, Gupshup, Z-API), nunca WhatsApp Web
ou biblioteca não oficial — risco de banimento do número do cliente.

**Decisão:** Twilio foi escolhido como BSP. Todo webhook chega em
`src/app/api/webhooks/whatsapp/route.ts` e é validado por
`X-Twilio-Signature` (HMAC, implementado em
`src/modules/whatsapp/domain/signature.ts`) **antes** de qualquer
processamento — mecanismo diferente do `X-Hub-Signature-256` da Graph API
direta da Meta, que a spec original também menciona (CLAUDE.md invariante
11 registra explicitamente a diferença para não confundir os dois). Envio e
download de mídia usam a REST API do Twilio via `fetch` direto (Basic Auth
com `TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN`), não o SDK `twilio` — que está
instalado em `package.json` mas não é importado em nenhum arquivo do
código atual.

**Alternativas descartadas:** WhatsApp Cloud API direta da Meta (motivo da
escolha do BSP não documentado nas specs lidas — presumivelmente redução de
complexidade de onboarding/Embedded Signup por conta do BSP); WhatsApp Web
ou automação não oficial (explicitamente descartado pela spec, risco de
banimento).

**Consequências:** Toda a superfície de validação de assinatura e todo o
texto de erro do sistema precisa ser específico do formato Twilio, não do
formato Meta puro — os dois não são intercambiáveis. A dependência `twilio`
no `package.json` está com uso não confirmado no código; vale decidir se o
SDK substitui as chamadas manuais via `fetch` ou se a dependência deve ser
removida.

---

## [7] Storage em filesystem local da VPS

**Data:** Agosto 2026 (spec v1.0, §3.4)

**Contexto:** O projeto roda em VPS auto-hospedada, sem AWS/S3/serviço de
nuvem gerenciado. Isso elimina egress e dependência externa, mas transfere
capacidade, durabilidade e controle de acesso para o próprio projeto.

**Decisão:** Comprovantes são persistidos em disco, endereçados por
conteúdo: `<tenant_id>/<aa>/<bb>/<content_hash>.<ext>`, nunca por caminho
vindo de input do usuário. Gravação durável em ordem específica (tmp file →
fsync → rename atômico → fsync do diretório → só então commit no banco).
Entrega protegida sem URL pré-assinada de nuvem: a aplicação autoriza e
delega ao Nginx via `X-Accel-Redirect`, diretório fora do webroot,
permissão `0700`. Em dev, `./storage/receipts` (presente no repositório,
`.gitignore`d); em produção, `/var/lib/parciva/receipts` em volume dedicado.

**Alternativas descartadas:** S3/bucket de nuvem gerenciada (contraria a
decisão de infraestrutura 100% auto-hospedada, ADR 9 da spec); servir
arquivo direto por rota pública com token na URL (sem a garantia de
`X-Accel-Redirect`, expõe mais superfície).

**Consequências:** Capacidade de disco, backup e criptografia em repouso
(LUKS + AES-256-GCM por arquivo) viram responsabilidade explícita do
projeto, não algo terceirizado.

**Atualização (18/08/2026):** `src/shared/storage.ts` agora existe e é
usado de verdade pelo worker — mas é uma v1 deliberadamente mínima:
escreve em arquivo temporário + `rename` atômico (garantia do próprio
filesystem), sem o protocolo completo de durabilidade descrito acima
(fsync do arquivo + fsync do diretório antes do commit no banco). Sem
cifra em repouso ainda. `storage_key` é sempre construído com `/`
(nunca `path.join` nativo) — bug real pego em dev no Windows, que gravava
`storage_key` com `\` e quebraria a montagem de path no Nginx em
produção (VPS Linux).

---

## [8] Parciva nunca custodia dinheiro

**Data:** Agosto 2026 (spec v1.0, §1, §2.5, ADR 11; decisão permanente)

**Contexto:** A Fase 6 (modelo B) introduz cobrança PIX gerada pelo próprio
Parciva. Sem essa fronteira explícita, existe pressão comercial natural para
"seria tão mais fácil se vocês recebessem e repassassem" (risco R-11 da
spec, classificado como Alta severidade — é o risco que muda o regime
jurídico do negócio).

**Decisão:** Parciva nunca é titular, intermediário nem custodiante do
dinheiro, em nenhuma hipótese. Quando a cobrança (modelo B) existir, o PIX é
emitido diretamente na conta do PSP do próprio tenant (`psp_connections`
aponta para a conta do tenant, nunca do Parciva); o recurso vai do pagador
direto para a empresa. Não existe saque, split ou repasse — nem na UI, nem
implementado no código, mesmo que a API de algum PSP ofereça a operação.
CLAUDE.md invariante 8 registra: se qualquer tarefa pedir retenção de valor,
parar e avisar, em vez de decidir sozinho.

**Alternativas descartadas:** Custodiar valores e fazer split/repasse para o
tenant (rejeitado permanentemente — mudaria o regime jurídico do negócio
para instituição de pagamento, exigindo licença regulatória).

**Consequências:** Decisão permanente — qualquer reavaliação exige
assessoria regulatória prévia, não decisão unilateral de engenharia. Hoje o
schema já reflete essa fronteira (`psp_connections.account_ref` é sempre do
tenant), mas nenhuma tabela ou endpoint de saque/transferência existe no
código — consistente com a decisão. As tabelas `psp_connections`, `charges`
e `charge_installments` existem no banco desde já, criadas vazias, mas o
módulo de aplicação (`src/modules/psp/`, `src/modules/charges/`) ainda não
existe — correto para a fase atual, planejado só para a Fase 6.

---

## [9] CNPJ alfanumérico aceito desde a Fase 1

**Data:** Agosto 2026 (spec v1.0, §5.6; implementado em `0bd9205`)

**Contexto:** A IN RFB nº 2.229/2024 introduz CNPJ alfanumérico (12
primeiras posições aceitam letras A–Z, 2 dígitos verificadores continuam
numéricos), com início de emissão previsto para meados de 2026. CNPJs
numéricos já emitidos continuam válidos indefinidamente. Tratar documento
como número em qualquer ponto do sistema quebra com letras e já era errado
antes (zero à esquerda).

**Decisão:** Documento é sempre texto — nunca `BIGINT`/`NUMERIC`/`int` em
nenhuma coluna, DTO, JSON ou variável — implementado em
`src/shared/document.ts`, único módulo autorizado a conter lógica de
CPF/CNPJ. Normalização (remover pontuação, `UPPER`) acontece sempre antes de
hash ou comparação. Dígito verificador alfanumérico usa módulo 11 com
`ASCII − 48` por caractere. Validação aceita os dois formatos (numérico e
alfanumérico) desde já, não só quando o novo formato começar a circular.
Constraint de banco reforça o formato: `CHECK (document ~
'^[0-9A-Z]{11,14}$')`.

**Alternativas descartadas:** Esperar a vigência oficial do formato
alfanumérico para implementar suporte (rejeitado — spec identifica esse
atraso como o bug mais provável da área, C-39/C-41: rejeitar CNPJ com letra
por "formato inválido" aparece como pagador legítimo recusado, não como erro
visível); duplicar regex de CNPJ em múltiplos arquivos conforme a
necessidade aparece (proibido — CLAUDE.md invariante 10).

**Consequências:** Todo código que compara ou faz hash de documento precisa
importar de `src/shared/document.ts`, nunca reimplementar. O corpus de teste
do pipeline de extração precisa incluir casos sintéticos com CNPJ
alfanumérico desde o início — pendência: não existe diretório `corpus/`
ainda no repositório, então esse corpus (real ou sintético) ainda não foi
criado.

---

## [10] OCR local (Tesseract) antes de qualquer VLM

**Data:** Agosto 2026 (spec v1.0, §7.1, Tier 2; implementado em `0bd9205`)

**Contexto:** A cascata de extração (decisão [4]) exige que a maioria dos
comprovantes nunca chegue a um LLM. OCR local resolve boa parte das imagens
sem custo de token nem dependência de provedor externo — ao custo de CPU
própria da VPS.

**Decisão:** Tier 2 da cascata usa Tesseract (`tesseract.js`, via
`src/modules/ingestion/infra/tesseract-ocr.ts`) com pré-processamento antes
de qualquer chamada a VLM (Tier 3+). O worker (`receipt-worker.ts`) roda com
`concurrency: 1` deliberadamente — decisão explícita no código porque OCR
local disputa CPU com Postgres e Redis na mesma VPS (spec §1.8.3/C-30: dois
processos de OCR concorrendo por núcleo faz a latência de tudo disparar).

**Alternativas descartadas:** PaddleOCR (citado como alternativa na spec,
não escolhido — Tesseract via `tesseract.js` tem integração mais direta em
Node/TS); pular OCR local e ir direto para VLM barato (mais simples, mas
caro em escala e dependente de provedor externo para o caso mais comum).

**Consequências:** Em produção, se OCR local for ativado, a spec recomenda
subir o worker para 2,5 GB de memória e manter concorrência em 1 — trade-off
de throughput por estabilidade do host compartilhado. Hoje o worker já
nasce com essa restrição de concorrência aplicada, mesmo antes de existir
tuning de infraestrutura formal.

---

## [11] Número WhatsApp compartilhado em vez de por tenant

**Data:** Agosto 2026 (implementado em `f533aa3`, 13/08/2026 — decisão de
fase atual, não permanente)

**Contexto:** A spec (§9.1) recomenda que cada tenant conecte o próprio
número de WhatsApp (Embedded Signup), para não concentrar risco de
reputação num único número. Implementar onboarding de número por tenant,
porém, depende da tabela `whatsapp_channels` e de resolução de tenant a
partir de `payload.To` — nenhuma das duas existe ainda nesta fase.

**Decisão (estado atual do código, não o alvo final):** O projeto opera
hoje com **um único número Twilio compartilhado**, configurado via variável
de ambiente global `TWILIO_WHATSAPP_FROM`. O contexto de tenant no webhook
(`src/app/api/webhooks/whatsapp/route.ts`) está hardcoded como
`{ tenantId: "" }`, com TODO explícito no código: resolver o tenant a partir
de `payload.To` em `whatsapp_channels.phone_number_id` assim que o banco
estiver conectado a esse fluxo.

**Alternativas descartadas:** Implementar onboarding por tenant já na Fase 3
(rejeitado por ordem de dependência — exige `whatsapp_channels` e conexão
real do webhook ao banco, que a Fase 3 não entregou; ver PROGRESS.md).

**Consequências:** Esta é uma decisão **temporária de sequenciamento**, não
uma mudança de arquitetura-alvo — a spec continua recomendando número por
tenant. Enquanto o número for compartilhado, o produto não pode operar mais
de um tenant real simultaneamente sem confundir a origem das mensagens —
isso bloqueia a Fase 4 (onboarding self-service) e precisa ser resolvido
antes de qualquer cliente real além do uso próprio do fundador.

**Atualização (18/08/2026):** `whatsapp_channels` agora existe no schema
(`0003_gigantic_true_believers.sql`) e a resolução de tenant a partir de
`payload.To` está implementada de verdade em
`src/modules/whatsapp/infra/channel-repository.ts` — o TODO citado acima
("resolver o tenant a partir de `payload.To`") está fechado;
`src/app/api/webhooks/whatsapp/route.ts` não tem mais `tenantId: ""`
hardcoded. A tabela é tratada como **raiz** (fora da RLS, mesmo motivo de
`tenants`/`users`/`plans`) porque resolver o tenant precisa acontecer
*antes* de existir um `tenantId` para o `SET LOCAL` — ver decisão [13]. A
limitação em si (um único número compartilhado, `seed.ts` cria uma única
linha em `whatsapp_channels` apontando pra `TWILIO_WHATSAPP_FROM`)
continua exatamente como descrita acima — só a mecânica de resolução
deixou de ser TODO.

---

## [12] ESLint + Prettier em vez de Biome (compatibilidade Windows)

**Data:** Agosto 2026 (implementado em `0bd9205`, 17/08/2026)

**Contexto:** `docs/quitou-setup.md` (§1.3) sugere Biome como opção de
qualidade de código (`@biomejs/biome`), com a ressalva "ou eslint+prettier,
se preferir". O ambiente de desenvolvimento principal deste projeto é
Windows.

**Decisão:** O projeto usa ESLint (`eslint.config.js`, flat config,
`@typescript-eslint`, `eslint-plugin-tailwindcss`) + Prettier (`prettierrc`)
como stack real de lint/format. Não há `@biomejs/biome` nem `biome.json` no
repositório. Scripts `lint` e `format` no `package.json` chamam
`eslint`/`prettier` diretamente; `pnpm check` roda `lint && tsc --noEmit &&
test && check:tokens`.

**Alternativas descartadas:** Biome (rejeitado por compatibilidade de
binário/toolchain no Windows, ambiente principal de desenvolvimento deste
projeto).

**Consequências:** Qualquer regra de lint nova (ex.: `no-restricted-imports`
para blindar fronteira de módulo, ou `tailwindcss/no-arbitrary-value` para
travar o design system) precisa ser configurada em `eslint.config.js`, não
em `biome.json`. `pnpm check` é o gate único antes de commit — inclui lint,
tipos, testes e a checagem de tokens de design (`check:tokens`), mas ainda
não inclui `gitleaks` no fluxo automatizado do dia a dia (só existe como
script `secrets:scan` separado).

---

## [13] Role de aplicação não-superusuário, separado do role de migração

**Data:** 18/08/2026 (pego e corrigido durante a tarefa "conectar
ingestão ao banco real")

**Contexto:** A decisão [1] desenhou RLS com 4 camadas de defesa, mas até
esta tarefa nenhum código de domínio tinha escrito no banco de verdade —
então nunca tinha sido testado contra um Postgres vivo. Ao escrever
`tests/security/tenant-isolation.test.ts` (o primeiro teste real da
policy), todos os casos falharam: a sessão de um tenant enxergava e até
conseguia inserir linha de outro. Investigação: `docker-compose.yml`
define só `POSTGRES_USER=parciva`, que o Postgres cria como
**superusuário** — e superusuário ignora RLS incondicionalmente, mesmo
com `FORCE ROW LEVEL SECURITY` (a doc do Postgres é explícita: FORCE só
afeta o dono não-superusuário; superusuário está sempre fora do alcance
de qualquer policy). Ou seja: a camada 1 de defesa da decisão [1] nunca
esteve realmente ativa no ambiente de desenvolvimento.

**Decisão:** `infra/init-db.sql` (montado em
`/docker-entrypoint-initdb.d/` no `docker-compose.yml`, roda uma vez na
criação do volume) cria um segundo role, `parciva_app`, com
`NOSUPERUSER NOBYPASSRLS`, e `ALTER DEFAULT PRIVILEGES FOR ROLE parciva`
concedendo `SELECT/INSERT/UPDATE/DELETE` em toda tabela futura criada
pelo dono — resolve o problema de ordem (o script roda antes de
`pnpm db:migrate` criar qualquer tabela). `src/db/client.ts` (`getDb`/
`getRootDb`, o único ponto de acesso ao banco para código de domínio)
passa a conectar via uma variável nova, `APP_DATABASE_URL`, **sem
fallback** para `DATABASE_URL` — um fallback silencioso reintroduziria
exatamente o bug. `DATABASE_URL` continua sendo o role dono
(superusuário), usado só por `migrate.ts`/`seed.ts`/`admin-client.ts`
(que já documentava a necessidade de um role `BYPASSRLS` separado para o
superadmin — agora essa separação é real nos dois sentidos: admin
bypassa de propósito, app nunca bypassa).

**Alternativas descartadas:** Confiar que produção já teria um role
separado e não mexer no `docker-compose.yml` de dev (rejeitado — dev é
onde qualquer regressão de RLS seria pega antes de produção; um ambiente
de dev que não exercita a defesa real dá falsa confiança). Revogar
`BYPASSRLS`/superusuário do role `parciva` existente em vez de criar um
novo (rejeitado — quebraria `migrate.ts`/`db:generate`, que precisam de
privilégio de DDL/dono de tabela).

**Consequências:** Qualquer ambiente novo (staging, produção, CI) precisa
replicar essa separação de role — não é suficiente copiar só
`DATABASE_URL`. Se `APP_DATABASE_URL` não estiver configurado,
`src/db/client.ts` cai no fallback hardcoded
`postgresql://parciva_app:parciva_app@localhost:5432/parciva_dev`, que só
existe se `infra/init-db.sql` tiver rodado — em produção isso precisa ser
provisionado explicitamente (script equivalente ou `CREATE ROLE` manual),
não existe automação fora do `docker-compose.yml` de dev ainda. O teste
de isolamento (`tests/security/tenant-isolation.test.ts`) é o que garante
que essa regressão específica não volta silenciosamente.

---

## [14] Convenção de direção do ledger e ordem de imputação

**Data:** 18/08/2026 (Marco 1 do roadmap de fechamento das Fases 0–3 —
motor de alocação + ledger)

**Contexto:** A spec define `ledger_entries.direction ENUM(debit,
credit)` (§5.2) mas não diz o que cada valor significa em termos de
efeito sobre a dívida do contrato — só o schema, sem convenção. Sem
definir isso antes de escrever o primeiro lançamento real, cada caso de
uso inventaria sua própria leitura, e o ledger deixaria de ser
consistente consigo mesmo (quebra §6.1: "capaz de *replay*").

**Decisão:** `direction: "credit"` reduz a dívida do contrato (pagamento
aplicado); `direction: "debit"` aumenta a dívida (reversão de um
`credit` anterior, ou lançamento de ajuste). `amount_cents` é sempre a
magnitude (positiva) do lançamento — o sinal do efeito vem só de
`direction`, nunca de um `amount_cents` negativo. `entry_type` (texto
livre no schema) usa `"payment_applied"`, `"payment_reversed"` e
`"credit_balance_created"` neste marco — outros casos de uso que vierem
a escrever no ledger devem seguir o mesmo padrão de nome
(`substantivo_verbo_no_particípio`), não inventar convenção nova.
`rule_version` grava `"alloc-v1"` (constante em
`reconciliation/infra/payment-repository.ts`) — trocar essa constante
sempre que a lógica de `allocatePayment` mudar de forma que afete o
resultado, para permitir replay fiel (§6.1).

Dentro de uma parcela, o valor alocado é dividido em linhas
`payment_allocations.kind` na ordem juros → multa → principal (spec
§6.5, último parágrafo). Como `installments.paid_cents` é um valor
agregado (o schema não separa quanto já foi pago de cada balde), o
motor (`reconciliation/domain/allocation-engine.ts`,
`remainingByKind`) assume que todo pagamento anterior já foi aplicado
nessa mesma ordem — premissa que só se sustenta porque este é o único
código que escreve `paid_cents`. Se algum dia outro caminho vier a
gravar `paid_cents` diretamente (ex.: importação em massa), essa
premissa quebra silenciosamente — deve ser revisada nesse momento.

**Alternativas descartadas:** Deixar `direction` sem convenção escrita e
decidir caso a caso (rejeitado — é exatamente o tipo de ambiguidade que
gera replay inconsistente, o motivo de existir a decisão [1] do §6.1).
Separar `paid_cents` em `paid_interest_cents`/`paid_fine_cents`/
`paid_principal_cents` no schema para não depender da premissa de ordem
(rejeitado por ora — mudança de schema maior do que o Marco 1 pedia;
registrado como possível revisão futura se a premissa se provar frágil).

**Consequências:** Qualquer novo caso de uso que escreva em
`ledger_entries` (ex.: Marco 4 — decisão automática vs. revisão via IA,
ou Fase 6 — webhook do PSP) precisa seguir esta convenção, não inventar
a própria. `early_payment_policy: "reduce_amount"` não foi implementada
neste marco (cai em `credit_balance`) porque redistribuir
`amount_cents` de parcelas futuras é reestruturação de cronograma, não
alocação de um pagamento — não é lançamento de ledger no sentido desta
decisão, é mudança de dado em `installments` que ainda não tem desenho
próprio.

---

## [15] Autenticação: sessão opaca em Postgres, Argon2id, MFA adiado

**Data:** 18/08/2026 (Marco 2 do roadmap de fechamento das Fases 0–3 —
autenticação e sessão)

**Contexto:** A spec (§3.1) recomenda "Auth.js (ou Lucia) com sessões no
Postgres próprio" e (§10.2) exige Argon2id, MFA obrigatório para owner/
admin, CSRF em rota com cookie, rate limit no login. Até este marco não
existia autenticação nenhuma — `users.passwordHash` nunca era escrito
por código nenhum, `resolveTenantContext` esperava um `sessionUserId`
que nada produzia.

**Decisão:**
- **Sessão hand-rolled, não Auth.js/Lucia.** Token opaco de 32 bytes
  (`crypto.randomBytes`), guardado no cookie `httpOnly`/`SameSite=Lax`;
  o banco (`sessions.id`) guarda só o **hash SHA-256** do token, nunca o
  valor bruto — um vazamento do banco não basta pra sequestrar sessão
  de ninguém (mesmo raciocínio de `hashTransactionRef` em
  `reconciliation/infra/payment-repository.ts`). Preferido a uma lib de
  auth pronta pelo mesmo motivo da decisão [6] (Twilio manual em vez do
  SDK): o projeto já hand-rola integrações inteiras quando o ganho de
  uma dependência não compensa a superfície extra — sessão opaca em
  Postgres é ~200 linhas, não justifica puxar um framework.
- **Hash de senha: `@node-rs/argon2`.** Binário pré-compilado
  (napi-rs) — funciona no Windows (ambiente principal de
  desenvolvimento, mesmo motivo da decisão [12]) sem toolchain de build
  nativo, ao contrário do pacote `argon2` clássico (node-gyp).
- **Defesa de sessão em duas camadas**, mesmo padrão de defesa em
  profundidade da decisão [1]: `src/middleware.ts` (runtime Edge) só
  checa presença do cookie — rápido, mas não pode validar contra o
  banco porque `postgres-js` exige socket TCP cru, que Edge não
  oferece (mesmo motivo do webhook do WhatsApp rodar em `runtime:
  "nodejs"`, não Edge). A validação real (hash contra `sessions`,
  expiração) acontece em `identity/application/require-session.ts`,
  chamada por cada rota protegida.
- **CSRF sem armazenamento próprio.** Token derivado via
  `HMAC(SESSION_SECRET, hash_da_sessão)` — recalculável a qualquer
  momento a partir do que já está persistido, sem tabela nem coluna
  nova. Comparação em tempo constante (`timingSafeEqual`).
- **Convite modelado como `membership` com `accepted_at: null`** (não
  uma entidade própria) — o schema (`tenancy.ts`) já tinha
  `invited_by`/`accepted_at` desde a fundação, só faltava algo
  escrevendo neles. `invite_tokens` (tabela nova) é só o token que
  entrega o link a alguém que ainda não tem sessão.
- **`sessions`/`invite_tokens` são tabelas raiz** (sem RLS) — resolver
  sessão ou validar convite precisa acontecer antes de qualquer
  `tenantId` existir, mesmo motivo de `whatsapp_channels`/`users`
  ficarem fora da RLS.
- **MFA adiado, deliberadamente.** A spec marca obrigatório pra owner/
  admin, mas TOTP completo (segredo, QR code, códigos de recuperação) é
  escopo grande por si só — login básico entra primeiro, testável no
  navegador; MFA vira marco próprio. `users.mfaEnabled`/`mfaSecretRef`
  já existem no schema, prontos para receber.
- **Sem verificação contra senha vazada** (HaveIBeenPwned ou similar,
  citado na spec §10.2) — exigiria integração com serviço externo, fora
  do escopo deste marco. Política hoje é só comprimento mínimo (8
  caracteres).

**Alternativas descartadas:** JWT stateless (rejeitado pela própria
spec — sessão em Postgres é revogável, JWT não é sem infraestrutura
extra de blocklist); Auth.js/Lucia (rejeitado — ver acima, dependência
não compensa pra sessão opaca simples); tabela separada de "invites"
com seus próprios campos de tenant/role (rejeitado — duplicaria o que
`memberships` já modela, `invite_tokens` só precisa ser o token).

**Consequências:** Qualquer rota nova sob autenticação precisa chamar
`requireSession` explicitamente (não há middleware Node validando de
verdade) — esquecer isso é a forma mais provável de introduzir um
buraco de autorização no futuro; vale revisar quando o Marco 3 trouxer
as primeiras páginas protegidas de verdade. Envio real de e-mail
(convite, boas-vindas, reset de senha) continua em aberto — hoje só
loga o link, registrado em PROGRESS.md.

---

## [16] UI do Marco 3: Server Actions, não API route + fetch

**Data:** 18/08/2026 (Marco 3 do roadmap — telas de Contratos e
Pagadores)

**Contexto:** As telas de auth (Marco 2) usam o padrão API route
(`route.ts`) + `fetch` do lado do cliente (`"use client"`, `useState`,
`onSubmit`). Pra Contratos/Pagadores (4 formulários novos: criar
pagador, criar contrato, registrar pagamento, reverter pagamento), o
mesmo padrão significaria 4 rotas de API novas + 4 componentes cliente
só pra serializar `FormData`→JSON e tratar erro.

**Decisão:** Server Actions do Next.js (`"use server"`), com
`<form action={fn}>` — sem componente cliente pra maioria das telas
(só `payers/actions.ts`/`contracts/actions.ts`, chamados diretamente
pelo atributo `action` do `<form>`, com `tenantSlug` etc. amarrados via
`.bind(null, ...)`). Cada Server Action chama `requireTenantSession
(tenantSlug)` no próprio corpo — não confia em nada que a página tenha
validado antes, porque uma Server Action é um endpoint próprio, exposto
independente de qual página a invocou. Erros de validação viram
`redirect` de volta pro formulário com `?error=<código>` na query
string (mapeado pra rótulo em português na própria página) — não há
"error boundary" próprio ainda, é o mecanismo mais simples que funciona
com formulário HTML puro.

Next.js já protege Server Actions contra CSRF checando o header
`Origin` automaticamente (desde a v14) — por isso o token HMAC de
`identity/domain/session.ts` (decisão [15]) não precisa ser checado
manualmente aqui. Isso deixa mais visível ainda que `/api/team/invite`
(Marco 2, uma API route "crua") nunca chegou a checar esse token —
lacuna registrada em PROGRESS.md, não corrigida neste marco.

**Alternativas descartadas:** Manter o padrão API route + fetch do
Marco 2 pras telas novas (rejeitado — 4x o boilerplate de serialização/
tratamento de erro sem ganho real, já que nenhuma dessas telas precisa
de interatividade rica que justifique JavaScript de cliente).

**Consequências:** Daqui pra frente, formulário simples (submit → grava
→ redireciona) usa Server Action; só interatividade de verdade (typeahead,
validação em tempo real, etc.) justifica voltar a um componente cliente
com `fetch`. `StatusChip` (`src/ui/components/StatusChip.tsx`) ganhou 6
chaves novas pra cobrir `installments.status`/`payments.status ===
"reversed"` — mesma disciplina de zero cor semântica da decisão de
design da spec §13.1 (peso de borda + decoração + posição, nunca
matiz); `reversed` tem rótulo próprio ("Estornado"), nunca reusa
"Rejeitado" (spec §13.3: nomear com precisão pelo que aconteceu).
`payments` não tem `contract_id` direto no schema (spec §5.2) —
`listPaymentsByContract` precisa passar por `payment_allocations →
installments.contract_id`; qualquer código futuro que precise de
"pagamentos de um contrato" deve reusar essa função, não reinventar o
join.

## [17] Risco/fraude em §6.6 é no-op documentado até a Fase 5

**Data:** 18/08/2026 (Marco 4 do roadmap — ligar ingestão ao motor)

**Contexto:** A spec §6.6 lista risco/fraude como parte das condições
para auto-aplicar um pagamento vindo de comprovante: "`risk_score`
abaixo do limiar" e "nenhum `fraud_check` com resultado `fail`". O
módulo `fraud` não existe — é trabalho da Fase 5 (fora do roadmap desta
sessão, que cobre só débito das Fases 0–3). Implementar `auto-apply-
decision.ts` sem alguma resposta pra essas duas condições deixaria a
lacuna escondida dentro do código, sem registro — o tipo de coisa que
CLAUDE.md pede pra eu parar e avisar antes de decidir sozinho (o
invariante 5, "na dúvida, revisão humana", é exatamente o que essas
condições reforçam).

Perguntei ao usuário antes de implementar: tratar como bloqueio total
(nunca auto-aplicar nenhum comprovante até o módulo de fraude existir)
ou como no-op documentado (as outras condições do §6.6 continuam
valendo de verdade, risco/fraude simplesmente não soma nem subtrai
nada à decisão). Confirmado: **no-op documentado**.

**Decisão:** `reconciliation/domain/auto-apply-decision.ts`
(`decideAutoApply`) não recebe nenhum parâmetro de risco/fraude — a
função inteira nunca menciona os dois. As outras seis condições do
§6.6 continuam obrigatórias e reais: confiança ≥ 0,90; nenhum campo
crítico em `field_confidence` abaixo de 0,85 quando presente;
identificação por telefone ou documento (nunca por nome); alocação sem
sobra (`remainingCents === 0`); data paga plausível (não futura, não
mais de 30 dias no passado); valor dentro do teto de auto-aprovação
(`tenants.settings.autoApprovalCeilingCents`, default R$ 5.000).
Qualquer uma falhando cai em `needs_review` — nunca em `rejected`
sozinho (a spec também proíbe isso).

**Alternativas descartadas:** Bloquear toda auto-aplicação até a Fase 5
(rejeitado pelo usuário — travaria o marco inteiro por uma peça que não
está no escopo combinado, e as outras seis condições já formam uma
barreira real, não uma barreira de fachada). Adicionar uma coluna
`risk_score` em `reconciliation_proposals` já preparada para o futuro
(rejeitado — não há nada real para gravar ali ainda; uma coluna sempre
nula seria promessa vazia, não preparação).

**Consequências:** Quando o módulo `fraud` existir (Fase 5),
`decideAutoApply` ganha um parâmetro a mais e uma condição a mais — não
é uma reescrita, é extensão do que já existe. Até lá, um comprovante
poderia teoricamente ser auto-aplicado mesmo sendo fraudulento, desde
que passe em todas as outras seis condições reais — risco aceito
conscientemente pelo usuário para este marco, registrado aqui e em
PROGRESS.md com destaque (não escondido em comentário de código). O
mesmo raciocínio de no-op vale para `field_confidence`: nenhum tier
hoje (determinístico, OCR) preenche essa chave por campo, então a
condição relacionada nunca dispara na prática até um tier futuro (VLM)
começar a populá-la — não é uma lacuna nova, é a mesma ausência que já
existia antes deste marco, agora só formalmente conectada à decisão.

---

## [18] Marco 5 sem VLM — só OCR, por decisão do usuário

**Data:** 18/08/2026 (Marco 5 do roadmap — resto da Fase 2)

**Contexto:** O plano original do Marco 5 (PROGRESS.md) incluía Tier 3
(segundo provedor de VLM plugável, spec §7.3) e registro de custo por
extração. Antes de implementar, perguntei ao usuário qual seria o
segundo provedor — a spec exige opt-out de treinamento e retenção
zero/curta, não é decisão só de custo/qualidade. Resposta: **por
enquanto, só OCR — sem gasto com LLM.**

**Decisão:** O Marco 5 foi replanejado para excluir tudo que dependia
de VLM: segundo provedor, interface `ExtractionProvider` plugável
(anti-lock-in, spec §7.3), ligar Tier 3 no worker, e registro de
`cost_micros` (continua `NULL` — sem VLM rodando não há custo de token
a registrar, mesmo estado de antes). `infra/anthropic-vlm.ts` continua
existindo no código, sem uso — mesma situação de antes deste marco, só
que agora com a ausência de um segundo provedor formalmente registrada
como decisão de escopo, não lacuna esquecida. O que o Marco 5 entregou
de fato: Tier 1 real (`domain/pdf-text.ts`, via `pdfjs-dist`,
substituindo `buffer.toString("utf-8")`), Tier 0 quase-duplicata
(`domain/normalizer.ts`, aHash + Hamming distance, sem dependência
nova — só `sharp`, já instalado) e a tela de fila de revisão
(`/t/<slug>/review`).

**Alternativas descartadas:** Manter Tier 3/VLM no escopo do marco
mesmo sem provedor escolhido (rejeitado — travaria o marco inteiro por
uma decisão que precisa ser tomada com calma, não às pressas só para
não atrasar o resto do trabalho que não depende disso).

**Consequências:** Tier 3/4 (VLM), segundo provedor e registro de
custo ficam como pendência explícita para quando o usuário decidir
gastar com LLM — não fazem mais parte do roadmap ativo até lá (ver
PROGRESS.md, "Pendências conhecidas"). Enquanto isso, todo comprovante
que Tier 1/Tier 2 não resolverem cai direto em revisão humana — a fila
de revisão deste marco é o que torna isso operável, não só uma
peça isolada.

---

## [19] Fila de revisão: `reviewed_approved` distinto de `auto_applied`

**Data:** 18/08/2026 (Marco 5 do roadmap)

**Contexto:** `reconciliation_proposals.decision` (decisão [17]/Marco 4)
tinha só `auto_applied`/`needs_review`/`rejected` — nenhum valor
cobria "um humano aprovou manualmente na fila de revisão". Gravar
aprovação humana como `auto_applied` mentiria na trilha de auditoria
(spec §5.3: "log de toda decisão") sobre quem decidiu.

**Decisão:** Novo valor de enum `reviewed_approved`
(`ALTER TYPE ... ADD VALUE`, migração aditiva pura,
`0009_eminent_old_lace.sql`), usado só pelo caminho novo
`approveReceiptProposal` (`reconciliation/infra/payment-repository.ts`).
Esse caminho **nunca reaproveita** `proposal.proposedAllocations` (a
alocação calculada quando a proposta foi criada, no Marco 4) — recalcula
tudo dentro de um novo lock (`SELECT ... FOR UPDATE` na proposal +
nas installments, mesma transação), porque o estado do contrato pode
ter mudado entre a criação da proposta e a revisão humana. A proposal
também é travada antes de aprovar — segunda tentativa de aprovar a
mesma proposal (duplo clique, duas abas) falha com `already_reviewed`,
nunca aplica pagamento duplicado. `StatusChip` ganhou a chave
`reviewed_approved` ("Aprovado na revisão") — nunca reusa o rótulo
"Confirmado" (decisão [5]: reservado a `psp_confirmed`, confirmação
real do PSP; aprovação humana de comprovante continua sendo
comprovante).

**Alternativas descartadas:** Gravar aprovação humana como
`auto_applied` (rejeitado — mentira na auditoria); reaproveitar
`proposedAllocations` armazenado em vez de recalcular (rejeitado —
pode estar desatualizado, mesmo raciocínio de "sem janela de corrida"
já documentado para o caminho automático em `executeReceiptPaymentTx`).

**Consequências:** Qualquer relatório futuro de "quanto do volume foi
decidido por humano vs. pelo motor" pode usar `decision` diretamente,
sem heurística adicional. Serve o arquivo de comprovante em
`/t/<slug>/receipts/<id>/file` (novo, `readReceiptFile` em
`shared/storage.ts`) lendo o buffer direto do disco — em produção isso
deveria virar `X-Accel-Redirect` pro Nginx (decisão [7]), dívida
registrada, não implementada aqui (sem Nginx em dev).

---

## [20] `getRootDb()` não bypassa RLS — só `getAdminDb()` faz isso

**Data:** 18/08/2026 (Marco 6 do roadmap — isolamento cross-tenant nas 13
tabelas de domínio originais)

**Contexto:** Ao escrever `tests/security/tenant-isolation-tenancy.test.ts`
(a primeira vez que um teste tentava inserir, via `getRootDb()`, uma linha
"global" de `audit_logs` com `tenant_id: NULL` — o caso do superadmin,
spec §12), a tentativa falhou com "new row violates row-level security
policy" (ou, dependendo do estado da conexão, "invalid input syntax for
type uuid: ''" — sintoma diferente, mesma causa raiz). `getRootDb()`
(`src/db/client.ts`) conecta via `APP_DATABASE_URL` — o role `parciva_app`
(NOSUPERUSER NOBYPASSRLS, decisão [13]) — não o superusuário. O próprio
comentário do arquivo já avisava ("Nunca use para tabela com tenant_id"),
mas nenhum teste tinha exercitado uma tabela com RLS através dele antes
desta tarefa para confirmar o comportamento na prática.

**Decisão:** Nenhuma mudança de código — `getRootDb()` está correto como
está (root tables como `tenants`/`users`/`plans` nunca tiveram RLS, então
é seguro para elas). O teste foi corrigido para usar `getAdminDb()`
(`src/db/admin-client.ts`, role com `BYPASSRLS` de verdade) para simular
o caminho real do superadmin. Registrado aqui porque é exatamente o tipo
de confusão de nome que a decisão [13] já alertava ser fácil de cometer —
"root" e "bypass RLS" soam como sinônimos, mas são dois roles diferentes
com propósitos diferentes.

**Alternativas descartadas:** Fazer `getRootDb()` bypassar RLS também
(rejeitado — misturaria o propósito das duas funções e aumentaria o raio
de quem pode contornar a RLS sem querer; `getAdminDb()` já existe
exatamente para isso, com o comentário de restrição de import só para
`src/app/(admin)/**`).

**Consequências:** Qualquer teste futuro que precise simular o
superadmin (bypass de RLS de verdade) deve usar `getAdminDb()`, nunca
`getRootDb()` — `getRootDb()` serve só para as 4 tabelas raiz sem RLS
nenhuma. Vale considerar, fora do escopo desta tarefa, nomear as duas
funções de forma menos ambígua (`getRootDb` → algo como `getUnscopedDb`)
quando a tarefa de lint (`no-restricted-imports`, já citada em
`admin-client.ts`) for feita.

---

## [21] Marco 6 — isolamento nas 13 tabelas, CI, logger estruturado

**Data:** 18/08/2026

**Contexto:** Três débitos sem fase própria, listados em PROGRESS.md:
(1) `tests/security/tenant-isolation.test.ts` só cobria `receipts`/
`inbound_messages`; as 13 tabelas de domínio originais tinham RLS desde
`0001_rls.sql` mas nunca foram exercitadas contra Postgres vivo — risco
real, não só cobertura incompleta, dado o que a decisão [13] revelou.
(2) Não existia CI. (3) Não existia logger estruturado.

**Decisão:**
- **Isolamento:** 3 arquivos novos em `tests/security/`, agrupados pela
  cadeia de dependência real (reconciliation: payers→contracts→
  installments→payments→payment_allocations→credit_balances→
  ledger_entries, tudo via `executeManualPayment` real, nunca insert cru
  pra essas tabelas; charges: psp_connections/charges/charge_installments,
  Modelo B sem repositório ainda, insert cru justificado; tenancy:
  memberships/subscriptions/usage_counters/audit_logs). `audit_logs` —
  única das 13 com `tenant_id` nullable — ganhou teste extra confirmando
  que uma linha global (tenant_id NULL) não vaza pra nenhuma sessão de
  tenant, só para `getAdminDb()` (ver decisão [20]). `pnpm test:tenant`
  virou `vitest run tests/security` (glob), não mais um arquivo só.
- **CI:** `.github/workflows/ci.yml`, um job (`pnpm/action-setup` +
  `actions/setup-node`), serviços Postgres/Redis efêmeros, roda
  `infra/init-db.sql` (o MESMO script de dev, não uma cópia) pra criar
  `parciva_app` antes de migrar — fecha a lacuna que a decisão [13] já
  registrava sobre "qualquer ambiente novo precisa replicar essa
  separação de role". Env do job vem de um `.env` escrito num step
  (não `env:` do job) — os mesmos scripts (`pnpm db:migrate`, `pnpm
  check`) rodam sem nenhum caminho especial pra CI. `pnpm check` +
  `pnpm secrets:scan` (gitleaks, CLI direta via binário baixado — não a
  `gitleaks-action`, que exige licença paga fora de repositório
  público). Validado localmente ponta a ponta contra Postgres/Redis
  efêmeros isolados (containers descartáveis, portas diferentes das de
  dev) antes de existir a run real do Actions.
- **`.gitleaks.toml` novo** — o scan roda em modo filesystem (`--no-git`),
  que não respeita `.gitignore` sozinho: sem allowlist, varria
  `node_modules`/`.next` inteiros (lento, falso positivo em dependência
  de terceiro) e sempre "vazava" o `.env` local de dev (que é gitignored
  de propósito, invariante 7 — não é um vazamento real). Rodado contra o
  repositório inteiro depois de configurado: `no leaks found`.
- **Logger estruturado (`src/shared/logger.ts`):** hand-rolled (mesmo
  espírito de `Result`/`Money` — sem lib nova pra um problema pequeno),
  uma linha JSON por chamada, `LOG_LEVEL` (env) filtra o nível mínimo.
  Migração com escopo explícito: processos de produção contínua
  (workers, rotas de webhook/API, código de ingestão que eles chamam) —
  nunca `db/seed.ts`/`db/migrate.ts` (scripts de CLI manual, onde
  `console.log` cru é mais legível pra um humano). O link de convite/
  boas-vindas (dev, sem provedor de e-mail real — decisão [15]) continua
  logando o token cru de propósito — não é vazamento a redigir, é a
  única forma de testar o fluxo hoje.
- **Achado lateral, corrigido junto:** dois lockfiles no repositório
  (`package-lock.json` do npm e um `pnpm-lock.yaml` gerado localmente no
  Marco 5, nunca commitado) — resolvido a favor de `pnpm-lock.yaml`
  único (CLAUDE.md já documenta só comandos `pnpm`), com
  `packageManager: "pnpm@9.15.9"` fixado no `package.json`.
  `db:migrate`/`db:seed` também ganharam `--env-file=.env` (só `worker`
  já tinha isso) — sem isso, `pnpm db:migrate` local não lia o `.env`
  sozinho (bug real, pego de novo durante o Marco 5).

**Alternativas descartadas:** `gitleaks-action` em vez de instalar a CLI
direto (rejeitado — exige licença paga em repositório privado, risco de
quebrar o CI sem controle nenhum deste lado); manter `package-lock.json`
(rejeitado pelo usuário — contradiria os comandos `pnpm` já documentados
no CLAUDE.md).

**Consequências:** Todo push/PR agora passa por `pnpm check` +
`secrets:scan` de verdade, não só disciplina manual. Qualquer ambiente
novo que precisar do banco (staging, produção) tem em `infra/init-db.sql`
+ o passo do `ci.yml` um exemplo de referência de como provisionar os
dois roles corretamente. Registro estruturado ainda não cobre
`db/seed.ts`/`db/migrate.ts` nem todo `console.*` do projeto — cobertura
parcial, deliberada, não uma migração completa.

---

## [22] Três dívidas soltas: CSRF no convite, `db:reset`, cookie duplo

**Data:** 18/08/2026 (pós-Marco 6 — itens pequenos já identificados em
PROGRESS.md, sem marco próprio)

**Contexto:** Três pendências pequenas, cada uma já registrada em
PROGRESS.md desde marcos anteriores: (1) `/api/team/invite` nunca
checava o token CSRF que `deriveCsrfToken`/`verifyCsrfToken` (decisão
[15]) sempre existiram pra proteger — achado no Marco 3, nunca ligado no
Marco 2; (2) `db:reset` chamava `src/db/reset.ts`, um arquivo que nunca
existiu no repositório; (3) nenhuma delas tinha, na prática, um jeito do
cliente sequer OBTER o token CSRF — as duas funções eram exportadas e
nunca chamadas em lugar nenhum do código.

**Decisão:**
- **CSRF de verdade, padrão "cookie duplo".** Novo cookie
  `parciva_csrf` (`shared/session-cookie.ts`), **não** `httpOnly` — de
  propósito, pra JS de cliente ler e ecoar num header `X-Csrf-Token`.
  Gravado sempre junto do cookie de sessão, nas 3 rotas que criam
  sessão (login, signup, accept-invite) via um helper novo,
  `src/app/_lib/session-cookies.ts` (`setSessionCookies`/
  `clearSessionCookies`) — evita repetir as mesmas opções de cookie em
  cada rota. Fica fora de `src/shared/` de propósito: usa
  `deriveCsrfToken`/`node:crypto`, que não roda no runtime Edge do
  middleware (mesmo motivo de `identity/domain/session.ts` já não
  poder ser Edge-safe sozinho). `/api/team/invite` agora recusa (403,
  `invalid_csrf_token`) qualquer requisição sem o header batendo com o
  cookie — verificado ao vivo contra `next dev` real: sem header → 403;
  header errado → 403; header certo (lido do cookie que o signup
  devolveu) → 201. Só esta rota foi ligada porque é a única API crua
  hoje que muta estado fora de uma Server Action (que o Next.js já
  protege sozinho, decisão [16]) — qualquer rota nova nesse mesmo
  formato deve seguir o mesmo padrão.
- **`db:reset` implementado** (`src/db/reset.ts`) — `TRUNCATE ...
  CASCADE` em todas as tabelas de `public`, não `DROP SCHEMA`: preserva
  a estrutura (migrações continuam "aplicadas", `pnpm db:migrate`
  depois é no-op) e os `GRANT`/`ALTER DEFAULT PRIVILEGES` de
  `parciva_app` (`infra/init-db.sql`) — um `DROP SCHEMA` recriaria o
  schema com OID novo e perderia esses grants, reintroduzindo o
  problema da decisão [13] por outro caminho. `TRUNCATE` não dispara
  trigger de linha, só de statement — a proteção append-only do ledger
  não impede isto, de propósito (reset de dev existe pra destruir
  tudo). Guarda de segurança: recusa rodar se `DATABASE_URL` não
  apontar pra `localhost`/`127.0.0.1`. Testado de verdade contra o
  Postgres de dev: 24 tabelas limpas, `pnpm db:migrate`+`pnpm db:seed`
  recriaram o estado seedado, roles `parciva`/`parciva_app` intactos,
  `pnpm test:tenant` continuou passando depois.

**Alternativas descartadas:** `DROP SCHEMA public CASCADE` (rejeitado —
ver acima, perde os grants de `parciva_app`); guardar o token CSRF em
tabela/coluna própria (rejeitado desde a decisão [15] — o cookie duplo
não precisa de estado novo, é sempre recalculável a partir do que já
está persistido).

**Consequências:** Qualquer rota de API crua nova que mude estado
(fora de Server Action) deve ler `parciva_csrf` do lado do cliente e
mandar `X-Csrf-Token` — não há mecanismo automático tipo o do Next.js
pra Server Actions aqui. `db:reset` agora é seguro de usar em loop de
desenvolvimento (testar seed do zero sem derrubar o container).

---

## [23] Login sabe pra qual tenant ir — segunda policy de RLS em `memberships`

**Data:** 18/08/2026

**Contexto:** Login nunca soube pra qual tenant redirecionar quando o
usuário pertence a mais de um (ou só um, sem informar o slug) —
mitigado até aqui com um campo manual "empresa" no formulário. A causa
raiz: `memberships` tem `FORCE ROW LEVEL SECURITY` filtrando por
`tenant_id`, e não dá pra listar "os tenants deste usuário" sem já
saber um `tenant_id` pra setar `app.tenant_id` primeiro — o mesmo
problema de bootstrap que já tira `whatsapp_channels`/`sessions`/
`invite_tokens` da RLS, só que `memberships` não pode virar tabela raiz
(é dado sensível por tenant de verdade).

**Decisão:** Nova policy permissiva, só de SELECT, em `memberships`
(`0010_membership_self_lookup_rls.sql`):
```sql
CREATE POLICY self_membership_lookup ON memberships
  FOR SELECT
  USING (user_id = current_setting('app.user_id', true)::uuid);
```
Postgres faz OR entre policies permissivas do mesmo comando — uma
sessão com `app.user_id` setado (nova função `getUserDb(userId, run)`
em `db/client.ts`, paralela a `getDb(ctx)`) enxerga as PRÓPRIAS linhas
de `memberships` em qualquer tenant, nunca a de outro usuário, nunca
nenhuma outra tabela. `FOR SELECT` é obrigatório: sem ele, a mesma
condição valeria pra INSERT também, e um usuário conseguiria criar
membership pra si mesmo em qualquer tenant só sabendo o próprio
`user_id` — testado explicitamente que isso continua bloqueado.
`listMembershipsForUser(userId)` (`identity/infra/membership-
repository.ts`) é o ponto de entrada público; `/api/auth/login` chama
isso após autenticar e devolve a lista pro cliente — 0 tenants mostra
erro, 1 redireciona direto, 2+ mostra escolha inline na própria página
de login (sem rota nova). Verificado ao vivo contra `next dev`:
usuário com 2 memberships em tenants diferentes recebe os dois no
login; usuário com 1 recebe só o dele.

**Achado durante a implementação — GUC customizada "reseta" pra string
vazia, não NULL.** Testando a policy nova, `getUserDb()` quebrou com
`invalid input syntax for type uuid: ""` — `current_setting
('app.tenant_id', true)` devolvia `''`, não `NULL`, dentro de uma
transação que nunca setou essa GUC. Causa: numa conexão pooled
(`postgres-js`/`baseDb`) já usada antes por `getDb()` (que faz `SET
LOCAL app.tenant_id = ...`), o "reset" ao fim da transação volta pro
valor placeholder da GUC customizada (`''`), não pro estado "nunca
setado" — e as duas policies de `memberships` são avaliadas juntas
(OR), então isso quebrava tanto `getUserDb()` (sem `app.tenant_id`)
quanto um `getDb()` posterior na mesma conexão (sem `app.user_id`).
Corrigido em `0011_harden_membership_rls_null_guc.sql`, envolvendo os
dois `current_setting(...)` das policies de `memberships` em
`NULLIF(..., '')` antes do cast — string vazia vira `NULL`,
`tenant_id = NULL`/`user_id = NULL` é sempre falso (nunca concede
acesso por engano).

**Alternativas descartadas:** `getAdminDb()` (bypass real de RLS,
rejeitado — exclusivo do painel de superadmin, escopo errado pra um
fluxo de login normal); tabela raiz duplicada tipo `user_tenant_index`
sem RLS, mantida em sincronia manualmente (rejeitado — cria um segundo
lugar de verdade que pode divergir de `memberships`, o tipo de
duplicação que o projeto evita, ex. `installments.paid_cents`
agregado, decisão [14]).

**Consequências:** Qualquer código futuro que precise fazer uma
consulta "por usuário, atravessando tenant" em `memberships` deve usar
`getUserDb`/`listMembershipsForUser`, nunca `getRootDb()` (RLS ainda
ativa, devolveria vazio) nem `getAdminDb()` (blast radius errado). O
achado da GUC "reseta pra vazio, não NULL" é uma classe de bug que só
se manifesta quando uma tabela tem MAIS de uma policy dependendo de
GUCs customizadas diferentes, ou quando uma nova função de acesso ao
banco não seta todas as GUCs que outras funções já esperam — vale
lembrar disso se um dia existir uma terceira forma de acesso
escopado além de `getDb`/`getRootDb`/`getUserDb`/`getAdminDb`.

---

## [24] Painel de admin: rota corrigida, dado real — resto fica pendente

**Data:** 18/08/2026

**Contexto:** Investigando "como acessar o painel de admin", confirmei
ao vivo (`curl` contra `next dev`, com e sem `x-admin-secret`) dois
problemas reais: `src/app/(admin)/page.tsx` colidia com
`src/app/page.tsx` em `/` (o dashboard nunca era servido) e as duas
páginas existentes mostravam dado hardcoded, nunca consultavam o
banco — apesar de `getAdminDb()` (`db/admin-client.ts`, role
`BYPASSRLS`) já existir pronto pra isso desde antes.

A spec (§12) pede um painel bem maior: app separado em subdomínio
próprio, autenticação independente com MFA obrigatório, quebra-vidro
completo (justificativa + janela de acesso + notificação ao Owner),
impersonação, feature flags, fila de DLQ, gestão de planos sem
deploy. Perguntado, o usuário confirmou: **só consertar o que está
quebrado agora** — mesmo tratamento que MFA do app principal (decisão
[15]) e VLM (decisão [18]) já receberam.

**Decisão:**
- `src/app/(admin)/` → `src/app/admin/` — remove o grupo de rota
  (parênteses), que era exatamente a causa da colisão em `/`. Não é o
  roteamento por subdomínio que a spec pede pra produção — é o
  desbloqueio mínimo pra a página existir; registrado como pendência,
  não confundido com a solução final.
- Novo `src/app/admin/_lib/queries.ts` — `getGlobalMetrics()`/
  `listTenantSummaries()`, ambos via `getAdminDb()`. Fica fora de
  `src/modules/admin/` de propósito: o comentário de `admin-client.ts`
  proíbe explicitamente qualquer `src/modules/**` de importar o
  cliente com bypass de RLS — só `src/app/admin/**` pode. Mesmo
  padrão de `src/app/_lib/require-tenant-session.ts` (glue
  Next.js-específico fora de `src/modules/`).
- `receipt_extractions.cost_micros` → centavos: `cents = micros /
  10_000` (1 unidade monetária = 1_000_000 micros = 100 centavos).
  Hoje sempre mostra R$ 0,00 — sem VLM rodando (decisão [18]), não há
  custo real a somar; não é bug, é o estado esperado até o dia que o
  Marco de VLM for retomado.
- `src/modules/admin/index.ts` ganhou export de verdade
  (`TenantSummary`/`GlobalMetrics`/`AdminAction`) — estava vazio, só
  um comentário; sem isso, `_lib/queries.ts` não teria como importar
  os tipos sem violar a fronteira de módulo (nunca `domain/**` direto
  de fora).

**Fora de escopo, deliberadamente (ver módulo `admin/README.md` para a
lista completa):** subdomínio real; MFA/login próprio do admin (auth
continua `x-admin-secret`, já documentado como placeholder desde
antes); quebra-vidro completo; registro em `audit_logs` a cada acesso
(TODO já existia em `admin-client.ts`, continua TODO); impersonação;
feature flags; DLQ; ações (mudar plano, suspender, conceder crédito);
busca por tenant/contrato/comprovante.

**Alternativas descartadas:** implementar quebra-vidro básico (só
registro em `audit_logs`, sem justificativa/janela) — oferecido como
opção intermediária, o usuário preferiu o escopo mínimo puro.

**Consequências:** `/admin` e `/admin/tenants` mostram dado real,
verificado ao vivo contra o Postgres de dev (contagem bate com
`SELECT count(*) FROM tenants WHERE status = 'active'` etc. rodado
direto no banco). O painel continua inadequado pra produção com
cliente real (sem MFA, sem subdomínio, sem quebra-vidro) — isso
precisa ser resolvido antes de operar mais de um tenant de fato, mas
essa decisão já estava registrada antes desta tarefa (spec §12) e
continua sendo dívida conhecida, não nova.
