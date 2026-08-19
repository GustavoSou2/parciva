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

---

## [25] Fase 4 parcial: cota real, custo de IA por tenant, cobrança via AbacatePay

**Data:** 18/08/2026

**Contexto:** A Fase 4 completa (spec §14) tem 5 entregáveis; três
dependiam de uma decisão de fornecedor que só o usuário podia tomar
(gateway de pagamento). Decisão tomada: **AbacatePay**, chave já em
`.env`. Confirmado também: só `essential` (R$99) e `professional`
(R$249) têm cobrança automática — `free` nunca cobra, `scale` continua
negociado manualmente. Reconfirmado, sem mudança: VLM continua
descartado (decisão [18]) — "custo de IA por tenant" mostra R$0,00
para todo mundo até esse marco ser retomado, estado esperado, não bug.

**Decisão:**
- **`enforceQuota()` (existia, nunca era chamado — mesma situação do
  CSRF antes da decisão [22]) agora roda de verdade.** Novo
  `billing/infra/usage-repository.ts` (`getLimits`/`getCurrentUsage`/
  `incrementUsage`, via `getDb(ctx)`, RLS já testada no Marco 6).
  `enqueueReceipt` (`api/webhooks/whatsapp/route.ts`) faz só
  pré-checagem (`checkQuota`, nunca incrementa — incrementar aqui
  também contaria a mesma mensagem duas vezes); `processReceiptJob`
  (`receipt-worker.ts`) chama `enforceQuota` de verdade antes de
  qualquer trabalho caro, rejeita sem criar linha em `receipts` se a
  cota mensal de `receipts_per_month` já foi excedida.
- **Custo de IA por tenant no painel de admin.** `listTenantSummaries()`
  (`app/admin/_lib/queries.ts`) ganhou `aiCostThisMonthCents` —
  `receipt_extractions` agrupado por `tenant_id` (coluna direta, sem
  join), soma de `cost_micros` do mês, mesma conversão micros→centavos
  de `getGlobalMetrics()`.
- **Achado que mudou o desenho da cobrança:** a API da AbacatePay (v2,
  confirmado empiricamente contra o ambiente de dev — a documentação
  pública mistura exemplos de v1/v2) não tem assinatura recorrente
  cobrada automaticamente: `checkouts/create` aceita `methods`/
  `items`/`customerId`, mas um `frequency: "SUBSCRIPTION"` enviado é
  silenciosamente ignorado — a resposta sempre volta
  `"frequency":"ONE_TIME"`. Não é um bloqueio: é o desenho natural para
  PIX no Brasil — **Parciva** controla o calendário de cobrança
  (`subscriptions.current_period_start/end`, já no schema desde a
  fundação), gerando uma cobrança PIX nova por ciclo; a AbacatePay só
  processa cada cobrança individual. Endpoints confirmados ao vivo
  contra a chave de dev: `POST /v2/products/create`, `POST
  /v2/customers/create` (plural — `/customer/create` devolve 400),
  `POST /v2/checkouts/create`; envelope de resposta
  `{success, data, error}`.
- **Schema:** `tenants.billing_customer_ref` (id do cliente na
  AbacatePay) e `plans.abacate_pay_product_id` (id do produto — este
  último não estava no plano original, achado durante o teste ao vivo:
  `checkouts/create` exige um produto pré-cadastrado via `items:
  [{id, quantity}]`, diferente do `/billing/create` v1 que aceitava
  produto inline). Nomes deliberadamente distintos de `psp_connections`
  (Modelo B, invariante 8/9) — isto aqui é o Parciva cobrando o TENANT
  pela própria assinatura do SaaS, não custódia de terceiro.
- **`billing/domain/abacatepay-signature.ts`** — HMAC-SHA256 base64 do
  corpo cru, header `X-Webhook-Signature`, mesmo padrão de
  `whatsapp/domain/signature.ts` (`node:crypto`, sem SDK, testável sem
  rede). Confirmado contra a documentação pública que o cabeçalho e o
  algoritmo são exatamente esses.
- **`billing/infra/abacatepay-client.ts`** — `fetch` cru (mesmo padrão
  de `anthropic-vlm.ts`/Twilio, decisão [6]): `createProduct`,
  `createCustomer`, `createCheckout`. Chave de API troca entre
  produção/dev via `NODE_ENV` (`ABACATE_PAY_API_KEY`/
  `ABACATE_PAY_DEV_API_KEY`).
- **`billing/application/{subscribe-tenant,handle-billing-webhook,
  cancel-subscription}.ts`** — `subscribeTenant` garante produto (1 por
  plano, reaproveitado) e cliente (1 por tenant, reaproveitado) antes
  de criar o checkout do ciclo atual; `handleBillingWebhook` reaproveita
  `tenant/domain/lifecycle.ts` (`transition`, já testado) para
  `checkout.completed`→`payment_confirmed`/`checkout.refunded`,
  `checkout.disputed`→`payment_failed`, nunca decide status por conta
  própria; `cancelSubscription` agenda `cancel_at = current_period_end`
  — tenant continua ativo até o fim do ciclo já pago, sem reembolso.
- **`api/webhooks/abacatepay/route.ts`** devolve status HTTP fiel ao
  resultado (400 assinatura inválida, 400 JSON malformado, 500 erro de
  processamento/config ausente, 200 só quando processado ou evento
  fora do mapa) — ao contrário do webhook do WhatsApp
  (`api/webhooks/whatsapp/route.ts`), que sempre devolve 200 porque o
  Twilio reenvia sem ajudar em nenhum caso de erro tratado lá. Aqui o
  reenvio da AbacatePay em backoff é desejável; o contraste está
  comentado explicitamente nos dois arquivos para não virar cópia
  errada depois.
- **`/t/<slug>/account`** (nova, mínima — spec §13.2 tela 7, só a parte
  de plano) — plano atual, status do tenant, ciclo/cancelamento
  agendado se houver assinatura, botões "Assinar" por plano
  (`billing:write`, RBAC já existia em `identity/domain/types.ts` desde
  a fundação, nunca checado em rota nenhuma até agora — mesma situação
  do CSRF antes da decisão [22]) e "Cancelar assinatura". Telefone/CPF-
  CNPJ do responsável são pedidos só na primeira assinatura (formulário
  inline, validado contra `shared/document.ts` — nunca duplicar regex
  de CPF/CNPJ, invariante 10); depois disso `billing_customer_ref` já
  existe e o cliente é reaproveitado.

**Verificado ao vivo, ponta a ponta:** `subscribeTenant` chamado duas
vezes contra a API de dev real (não mock) — primeira vez para
`essential` (cria produto, cria cliente, cria checkout,
`billing_customer_ref` persistido), segunda para `professional` no
mesmo tenant (cria produto novo, **reaproveita** o cliente já
persistido). Webhook testado com payload `checkout.completed`
assinado com HMAC de verdade contra um segredo de teste (o segredo
real de produção depende de um passo manual — criar o webhook no
painel da AbacatePay — fora do alcance desta tarefa): tenant
`trial→active` de verdade no banco, linha em `subscriptions`
(`provider: "abacatepay"`, período de 1 mês) criada. Assinatura
inválida → 400; segredo não configurado → 500; evento fora do mapa
(`payout.completed`) → 200 `ignored_event`; metadata ausente → 500
`missing_metadata`; tenant inexistente → 500 `tenant_not_found`.
Página `/t/<slug>/account` renderizada via `next dev` real
(signup → conta nova → planos com preço real do banco, formulário de
telefone/CPF-CNPJ aparecendo só na primeira assinatura).

**Achado durante a verificação, não corrigido (fora de escopo desta
tarefa):** se `createProduct` for chamado e a AbacatePay responder
"produto já existe" (`externalId` duplicado) — por exemplo, uma
tentativa anterior criou o produto na AbacatePay mas falhou antes de
persistir `plans.abacate_pay_product_id` —, `subscribeTenant` propaga
o erro e a assinatura desse plano fica permanentemente bloqueada até
alguém corrigir a coluna manualmente. Isso aconteceu de verdade nesta
sessão (dado de exploração anterior deixou um produto "essential"
órfão na AbacatePay) e foi contornado atualizando a coluna direto no
banco de dev. Corrigir de verdade exigiria a AbacatePay expor uma
forma de buscar produto por `externalId` (não confirmada empiricamente
até agora) ou tornar a escrita de `abacate_pay_product_id` atômica com
a criação do produto — registrado aqui como pendência real, não
implementado por não estar no escopo combinado com o usuário.

**Alternativas descartadas:** Confiar na documentação pública sem
testar contra a API de dev real (rejeitado pelo próprio usuário —
"trabalhe a partir da premissa de que ambos os endpoints são v2", mas
ainda assim a tarefa testou ao vivo antes de escrever o cliente
definitivo, mesma disciplina de testar contra Postgres real em vez de
mockar); cobrar todos os planos automaticamente, incluindo
`free`/`scale` (rejeitado pelo usuário — só essential/professional).

**Consequências:** Renovação automática por cron (disparar a cobrança
do próximo ciclo sozinho) e detecção de cobrança expirada sem webhook
ficam para uma tarefa de acompanhamento — sem isso, "assinar" funciona
mas nada renova só; ver PROGRESS.md. `ABACATE_PAY_WEBHOOK_SECRET`
segue vazio em `.env`/`.env.example` até o usuário criar o webhook no
painel da AbacatePay e informar o segredo gerado.

---

## [26] Cron de renovação de assinatura — reaproveita `subscribeTenant`, duas guardas contra cobrança duplicada

**Data:** 18/08/2026

**Contexto:** Pendência explícita da decisão [25]: `subscribeTenant`/
webhook funcionam, mas nada dispara a cobrança do próximo ciclo
sozinho — um tenant assinado ficaria `active` indefinidamente mesmo
sem pagar de novo.

**Decisão:**
- **`billing/application/renew-subscriptions.ts`** (`renewDueSubscriptions`,
  pura, testável sem banco) — enumera tenant por tenant via
  `tenant/listTenantIds()` (tabela raiz, sem RLS) e, para cada um, lê a
  assinatura via `getSubscriptionByTenant` (RLS de verdade, `getDb(ctx)`
  por dentro) — **nunca** um bypass de RLS tipo `getAdminDb()`, que o
  comentário de `admin-client.ts` já restringe a `src/app/admin/**`.
  Isolamento por tenant é mantido mesmo dentro de um processo de
  sistema, não só de rota HTTP — mesmo espírito da decisão [20].
- Uma assinatura `active` com `current_period_end` vencido cai em dois
  caminhos: se `cancel_at` já passou, finaliza o cancelamento
  (`transition(status, "cancel_requested")` + `markSubscriptionCancelled`,
  nunca cria cobrança nova); senão, gera a cobrança do próximo ciclo
  reaproveitando **a mesma função** `subscribeTenant` da primeira
  assinatura (produto/cliente já existem sempre numa renovação — por
  isso os campos de dono passaram a ser opcionais em
  `SubscribeTenantInput`, com erro novo `missing_owner_details` se
  faltarem E o cliente ainda não existir).
- **Ordem importa:** a cobrança é criada ANTES de qualquer
  `setTenantStatus`/`markSubscriptionPastDue` — se a chamada à
  AbacatePay falhar, o tenant continua exatamente como estava, nunca é
  punido por uma falha nossa (`outcome: "renewal_failed"`, sem mudança
  de estado).
- **Duas guardas independentes contra reencaminhar a mesma cobrança em
  dias seguintes** (mesmo espírito de defesa em profundidade da
  decisão [1]): (1) a validade da transição `payment_failed` em
  `tenants.status` — no segundo dia o tenant já está `past_due`, que
  não tem esse evento no grafo (`lifecycle.ts`); (2)
  `markSubscriptionPastDue`, que tira a assinatura do filtro
  `status === "active"` usado para selecionar quem está vencendo.
  Nenhuma depende da outra.
- **BullMQ repeatable job**, não um cron de SO — mesma fila/worker já
  usados para comprovante (`workers/queues.ts`/`workers/billing-
  renewal-worker.ts`), `jobId` fixo (`"billing-renewal-daily"`) faz o
  BullMQ deduplicar o agendamento a cada reinício do worker, nunca
  acumula um segundo cron correndo em paralelo. Diário, 03:00 UTC —
  cobrança PIX não é cronometrada ao segundo.
- **Achado ao adicionar o segundo worker, corrigido:** `receipt-
  worker.ts` e o worker novo tinham, cada um, seu próprio
  `process.on("SIGTERM", ...) → process.exit(0)` — dois handlers
  independentes do mesmo sinal correm risco real de um matar o
  processo antes do outro terminar de fechar sua conexão (C-31).
  Consolidado em `workers/main.ts`: um único par de handlers que
  aguarda `Promise.all([receiptWorker.close(), billingRenewalWorker.close()])`
  antes de `process.exit(0)`.

**Verificado ao vivo, ponta a ponta, contra o tenant de teste da
decisão [25] (não mock):** forcei `current_period_end` para o passado
— rodei o job real: gerou cobrança nova na AbacatePay (dev), tenant e
`subscriptions` foram para `past_due` nos dois. Rodei o job de novo
sem mudar nada: `outcome: "skipped"`, nenhuma chamada nova à
AbacatePay (as duas guardas seguraram). Depois, com `cancel_at` no
passado: tenant e `subscriptions` foram para `cancelled`, sem nenhuma
cobrança criada.

**Alternativas descartadas:** `getAdminDb()` pra enumerar assinaturas
de todo tenant de uma vez, sem loop (rejeitado — bypass de RLS restrito
ao painel de admin por design, decisão [20]; um processo de sistema não
é motivo para abrir essa exceção); coluna nova pra marcar "cobrança
pendente deste ciclo" (rejeitado — as duas guardas já existentes
resolvem sem estado novo, mesmo raciocínio de `subscriptions.cancel_at`
já bastar para o cancelamento sem coluna extra).

**Consequências:** "Assinar" agora realmente sustenta cobrança
recorrente sem intervenção manual — o que faltava desde a decisão [25].
Ainda pendente, fora do escopo desta tarefa: dunning depois de
`past_due` prolongado (hoje o tenant fica `past_due` indefinidamente
até pagar, nunca escala pra `suspended` sozinho) e detectar cobrança
expirada sem esperar o próximo ciclo via webhook — ambos exigiriam
decisão de produto (quantos dias de tolerância?) que não foi pedida
nesta tarefa.

---

## [27] Dunning automático — 7 dias em `past_due` → `suspended`, sem coluna nova

**Data:** 19/08/2026 (fechamento do resto da Fase 4, pendência da decisão [26])

**Contexto:** A decisão [26] deixou registrado que um tenant em
`past_due` ficava assim indefinidamente — o cron gerava a cobrança do
próximo ciclo, mas nada escalava pra `suspended` se o cliente nunca
pagasse. Faltava uma decisão de produto (quantos dias de tolerância?).
Perguntado, o usuário confirmou: **7 dias**.

**Decisão:**
- Novo evento de transição `payment_overdue` (`tenant/domain/types.ts` +
  `lifecycle.ts`), `past_due → suspended` — distinto de `admin_suspend`
  (suspensão manual de um superadmin, ainda não implementada em código
  nenhum). Dois eventos para o mesmo destino, nunca confundidos: quem
  suspendeu importa pra auditoria, mesmo raciocínio de "nomear com
  precisão pelo que aconteceu" já usado na decisão [19] pro par
  `auto_applied`/`reviewed_approved`.
- **Ancoragem sem coluna nova.** `subscriptions.currentPeriodEnd` já
  fica congelado no dia em que a renovação falhou (nada o avança
  enquanto `past_due` — só o webhook, ao confirmar pagamento, move via
  `nextPeriod()`). Isso já é "desde quando está vencido"; não foi
  criada uma coluna `past_due_since` porque o dado já existia.
- **Guarda de idempotência é a própria validade da transição** — mesmo
  padrão das duas guardas já descritas na decisão [26]: uma vez
  `suspended`, `transition("suspended", "payment_overdue")` é inválida,
  então rodar o cron em dias seguintes não repete a suspensão, sem
  precisar de estado extra em `subscriptions`.
- `tenant-repository.ts` (`setTenantStatus`) passa a gravar
  `tenants.suspended_at` (coluna existente desde a fundação, nunca
  escrita até agora) sempre que o novo status é `suspended` — vale
  tanto pra esta suspensão automática quanto pra uma futura suspensão
  manual (`admin_suspend`, ainda não implementada), sem precisar de um
  segundo ponto de escrita.
- **Correção incidental, sem escopo próprio:** o loop de
  `renewDueSubscriptions` foi reordenado para checar `cancelAt <= now`
  antes de exigir `status === "active"`. Antes desta mudança, um
  cancelamento pedido enquanto a assinatura já estava `past_due` nunca
  era revisitado pelo cron (o gate original só olhava pra `active`) —
  ficava preso pra sempre, nunca efetivado. Achado ao desenhar o novo
  ramo de dunning, corrigido junto por ser a mesma reordenação.

**Alternativas descartadas:** coluna `past_due_since` dedicada
(rejeitada — `currentPeriodEnd` já carrega essa informação, coluna nova
seria dado duplicado, mesmo raciocínio de `installments.paid_cents`
agregado citado na decisão [14]); reusar o evento `admin_suspend` pra
suspensão automática (rejeitada — misturaria ator humano e ator sistema
no mesmo evento, perdendo precisão de auditoria).

**Consequências:** `RenewalOutcome` ganhou `"suspended"`; o worker
(`billing-renewal-worker.ts`) loga `logger.warn` quando isso acontece
(evento operacional relevante, mesmo padrão do log de `renewal_failed`
já existente). Verificado ao vivo contra Postgres/AbacatePay de dev
reais (script descartável, removido ao final): assinar → fatura
`pending` → webhook confirma → `active`; forçar `currentPeriodEnd` 8
dias no passado + `past_due` → cron suspende de verdade
(`suspended_at` preenchido); rodar de novo → `skipped`, sem repetir.

---

## [28] Histórico de faturas — tabela `invoices` nova, não reaproveita `subscriptions`

**Data:** 19/08/2026 (fechamento do resto da Fase 4)

**Contexto:** `/t/<slug>/account` só mostrava o ciclo atual, nunca
cobranças passadas (spec §13.2 tela 7, "faturas"). `subscriptions`
guarda só a linha "atual" por tenant — `upsertSubscription` sempre faz
`UPDATE` in-place quando já existe linha, nunca `INSERT` de uma nova por
ciclo, apesar do comentário do arquivo dizer "schema permite histórico"
(a intenção nunca foi implementada).

**Decisão:** Tabela nova `invoices` (`src/db/schema/tenancy.ts`,
migração `0014_sad_squadron_sinister.sql` + RLS em
`0015_invoices_rls.sql`, mesma convenção de FORCE ROW LEVEL SECURITY +
policy `tenant_isolation` de `0001_rls.sql`/`0008_reconciliation_
proposals_rls.sql`) — uma linha por cobrança PIX gerada, não por tenant.
`planCode` é denormalizado de propósito: a fatura mostra o plano de
QUANDO foi cobrada, não o plano atual do tenant. `providerRef` (id do
checkout na AbacatePay) tem índice único — é a chave usada pra
atualizar o status depois.

Transformar `subscriptions` num ledger por ciclo (inserir em vez de
atualizar) foi descartado: toda função que hoje faz
`UPDATE ... WHERE tenant_id = ...` (`markSubscriptionPastDue`,
`markSubscriptionCancelled`) passaria a atualizar TODO o histórico de
uma vez se `subscriptions` deixasse de ter uma linha só por tenant —
mudança maior e mais arriscada do que o pedido. Uma tabela nova, só de
leitura histórica, é aditiva e não toca nada que já funciona.

`subscribeTenant` (`billing/application/subscribe-tenant.ts`) grava a
fatura `pending` só depois do checkout ter sido criado com sucesso —
nunca antes, um erro de plano/dados de dono não é cobrança de verdade.
`handleBillingWebhook` atualiza essa mesma linha por `providerRef`:
`checkout.completed → paid` (com `paidAt`), `checkout.refunded →
refunded`, `checkout.disputed → failed`.

**Alternativas descartadas:** reaproveitar `subscriptions` como ledger
por ciclo (rejeitada, ver acima); join com `plans` em vez de
denormalizar `planCode` (rejeitada — `plans` é tabela raiz sem RLS,
misturar root+domínio numa mesma query é evitável aqui e a fatura deve
mostrar o plano histórico, não o atual).

**Consequências:** Isolamento cross-tenant testado contra Postgres real
(`tests/security/tenant-isolation-tenancy.test.ts`, 3 casos novos, mesmo
padrão das outras tabelas da decisão [21]) — nenhuma tabela nova de
domínio entra sem RLS desde já, invariante 1 do CLAUDE.md.
`/t/<slug>/account` ganhou o card "Histórico de cobrança" (data, plano,
valor, status em português — mesmo padrão local de rótulo já usado
nesta página pra status do tenant, sem tocar no `StatusChip`
compartilhado). Verificado ao vivo contra Postgres/AbacatePay de dev
reais: assinar gera fatura `pending`; chamar `handleBillingWebhook`
direto com um evento `checkout.completed` sintético (sem passar pela
verificação de assinatura do endpoint, fora do escopo desta
verificação) vira `paid` com `paidAt` preenchido.

---

## [29] Fase 5 (fatia 1): módulo `fraud`, `fraud_checks`, `risk_score` — consolidação, não checks novos

**Data:** 19/08/2026

**Contexto:** A decisão [17] deixou `decideAutoApply` sem risco/fraude
("no-op documentado") porque o módulo `fraud` (Fase 5, spec §8) não
existia. Perguntado sobre por qual pedaço da Fase 5 começar (a spec tem
4 camadas de anti-fraude + conciliação por extrato, custos bem
diferentes), o usuário escolheu **consolidar o que já existia
espalhado no código**: `duplicate_hash`, `near_duplicate`, `e2e_reuse`,
`amount_match`, `date_plausible` — formalizar como módulo real, tabela
`fraud_checks`, `risk_score`, ligado a `decideAutoApply`. As outras 3
opções (checks forenses novos — PAYEE_MATCH/E2E_FORMAT/EXIF/ELA/etc.,
Camada C comportamental, conciliação por extrato) ficam pra uma fatia
futura.

**Investigação prévia — quanto disso já existia de verdade:**
- `DUPLICATE_HASH`/`NEAR_DUPLICATE`: `ingestion/application/ingest-
  receipt.ts` já bloqueia ANTES de qualquer `receipts` row existir
  (`return err("duplicate")`) — sem `receiptId`, não há como escrever
  `fraud_checks` ali (FK obrigatória). Design deliberado desde o Marco
  5 ("rejeitado antes de existir qualquer rastro persistido"), não uma
  lacuna nova — **ficou de fora desta fatia**, sem mudança.
- `AMOUNT_MATCH`/`DATE_PLAUSIBLE`: já eram condições duras em
  `decideAutoApply` (`remainingCents === 0`, `isPlausibleDate`) —
  continuam gates independentes, inalterados. Passaram a também gerar
  uma linha em `fraud_checks` (auditoria por check, spec §5.3) — não é
  regra de decisão nova, é registro do que já decidia.
- `E2E_REUSE`: só era pego REATIVAMENTE (violação `23505` no insert de
  `payments`, capturada como `duplicate_transaction`). Passou a ser
  checado PROATIVAMENTE, antes de `decideAutoApply`, dentro da mesma
  transação (`transactionRefAlreadyUsedTx`,
  `reconciliation/infra/payment-repository.ts`) — esta é a única
  proteção genuinamente nova desta fatia. O catch reativo continua
  intacto como rede de segurança contra corrida.

**Decisão:**
- **Novo módulo `src/modules/fraud/`.** `domain/evaluate.ts`
  (`evaluateFraudChecks`, puro) pontua os 3 signals via `FraudSignals`
  → `FraudAssessment { checks, riskScore, blocksAutoApply }`. Pesos
  (`CHECK_WEIGHTS`): `amount_match: 50`, `date_plausible: 40`,
  `e2e_reuse: 60` — deliberadamente NÃO proporcionais à "força" de cada
  check; `e2e_reuse` força revisão por pertencer a `FORCES_REVIEW`
  (conjunto explícito, spec §8.2: "qualquer check fail de peso alto
  força revisão independentemente do score"), não porque o peso
  numérico dele "vence" a soma — os outros dois (`amount_match` +
  `date_plausible`) sozinhos já conseguem cruzar
  `DEFAULT_RISK_SCORE_THRESHOLD` (50, único nesta fatia — sem perfil
  por tenant ainda, mesma simplificação de
  `DEFAULT_AUTO_APPROVAL_CEILING_CENTS` antes de virar setting)
  independentemente de `e2e_reuse`, provando que os dois mecanismos
  (força vs. score) são testáveis em isolamento.
- **`decideAutoApply` ganha `blocksAutoApply: boolean`** — não sabe de
  score nem peso, só do resultado final de `@/modules/fraud`, mesmo
  padrão das outras condições que já tinha. `isPlausibleDate` (antes
  privada) foi exportada dentro do módulo `reconciliation` pra
  `payment-repository.ts` reusar sem duplicar a lógica de dias.
- **`fraud_checks`** (`0016_young_ted_forrester.sql` + RLS em
  `0017_fraud_checks_rls.sql`, mesma convenção de `0008`/`0015`) — uma
  linha por check, sempre gravada dentro de `executeReceiptPaymentTx`,
  auto-aplicado ou não. `reconciliation_proposals.risk_score`
  (`numeric`, nullable) finalmente populado — a coluna já era prevista
  na spec (§5.3) mas nunca criada por falta de dado real (comentário
  antigo em `financial.ts`, agora removido).
- **UI de revisão** (`/t/<slug>/review`, `/t/<slug>/review/<id>`):
  coluna "Risco" na lista, card "Checagens de fraude" no detalhe — dá
  ao revisor humano o motivo por trás do risco, reforçando o invariante
  5 do CLAUDE.md ("na dúvida, revisão humana") com mais contexto, não
  só a decisão pronta.
- **Isolamento cross-tenant testado contra Postgres real** — achado
  durante esta tarefa: `reconciliation_proposals` tinha RLS desde o
  Marco 4 mas NUNCA tinha sido exercitada contra Postgres vivo (o
  arquivo de isolamento de reconciliação só cobre `executeManualPayment`,
  que nunca grava proposal). `tests/security/tenant-isolation-fraud.test.ts`
  fecha as duas lacunas de uma vez (fixture via `executeReceiptPayment`
  real) — mesmo padrão de "achar e corrigir lacuna de RLS nunca
  testada" da decisão [13]/[21], só que pego proativamente aqui, antes
  de virar incidente.

**Alternativas descartadas:** pesos proporcionais à "força" de cada
check, com `e2e_reuse` dominando a soma (rejeitado — acoplaria os dois
mecanismos de bloqueio, dificultando testar/entender cada um
isoladamente; a spec já separa os dois conceitos: pertencer ao
conjunto de força vs. contribuir pro score); threshold configurável
por tenant já nesta fatia (rejeitado — nenhum dado real ainda para
calibrar por tenant; mesma disciplina de introduzir a simplificação
primeiro, configurabilidade depois, já usada pro teto de
auto-aprovação); gravar `fraud_checks` também no caminho de
duplicata/quase-duplicata da ingestão (rejeitado — exigiria criar a
`receipts` row ANTES do check de duplicata, mudando uma ordem de
operações deliberada do Marco 5; fora do escopo combinado com o
usuário).

**Consequências:** Quando a próxima fatia da Fase 5 chegar (checks
forenses, Camada C, ou conciliação por extrato), `FraudSignals`/
`CHECK_WEIGHTS`/`FORCES_REVIEW` ganham entradas novas, não uma
reescrita — a mesma extensão que a decisão [17] já previa. `pnpm check`
completo (lint + tipos + 316 testes, incluindo os 6 novos de
isolamento) passa limpo; migração aplicada e verificada ao vivo contra
o Postgres de dev real (fixture end-to-end: `amount_match` corretamente
reprovado por um pagamento acima do principal, `risk_score` calculado,
`reconciliation_proposals`/`fraud_checks` isolados por tenant).

---

## [30] `receipts:approve` ligado em `review/actions.ts` — gap de autorização real, achado e corrigido

**Data:** 19/08/2026

**Contexto:** Investigando a fila de revisão antes de planejar a
conciliação por extrato, achei que `approveReviewAction`/
`rejectReviewAction` (`src/app/t/[tenantSlug]/review/actions.ts`) nunca
chamavam `requirePermission` — só `requireTenantSession` (que confirma
membership, não permissão nenhuma). Qualquer membro do tenant,
inclusive `viewer` (só leitura por design, spec §3.1), conseguia
aprovar/rejeitar uma proposta e aplicar pagamento real por essa
Server Action. `receipts:approve` já existia em `ROLE_PERMISSIONS`
(`identity/domain/types.ts`) desde a fundação — `operator` tem,
`viewer` não — mas nunca tinha sido checado em rota nenhuma. Mesma
categoria de lacuna que a decisão [22] fechou pro CSRF de
`/api/team/invite`: permissão desenhada, nunca ligada.

Perguntei ao usuário se corrigia agora ou registrava como pendência
pra não misturar com a tarefa de conciliação por extrato — confirmado:
corrigir agora.

**Decisão:** As duas actions passam a chamar
`requirePermission(session.role, "receipts:approve")` antes de
qualquer mutação, redirecionando com `?error=unauthorized` em caso de
falha (mesmo padrão de `account/actions.ts`). `review/[proposalId]/
page.tsx` ganhou `canApprove` (mesmo padrão de `canWrite` em
`account/page.tsx`) — quando falso numa proposta `needs_review`, mostra
uma mensagem em vez do formulário de aprovar/rejeitar, em vez de deixar
um botão visível que só devolveria erro ao ser clicado.

**Alternativas descartadas:** usar `payments:write` em vez de
`receipts:approve` (rejeitada — `payments:write` também libera
registrar pagamento manual em qualquer contrato, o que a spec
explicitamente nega ao operador: "aprova/rejeita, não mexe em
contrato"; `receipts:approve` é a permissão certa, só nunca tinha sido
usada).

**Consequências:** A lógica pura (`hasPermission`/`requirePermission`
pra `receipts:approve`) já era testada em
`identity/domain/authorization.test.ts` antes desta correção — o que
faltava era só a ligação na rota, sem lógica nova pra testar de
unidade. Verificação ao vivo da Server Action em si exigiria navegador
(mesma limitação já documentada pra outros fluxos de Server Action
deste projeto, ex. a verificação da fila de revisão no Marco 5) — não
feita aqui; `tsc`/`eslint`/suite de testes completa confirmados limpos
depois da mudança.

---

## [31] `contracts:write`/`payments:write` ligados em `contracts`/`payers` actions — mesmo gap da decisão [30], escopo maior

**Data:** 19/08/2026

**Contexto:** Investigando a fila de revisão pra decisão [30], notei
que o padrão "Server Action sem `requirePermission`" não era exclusivo
dela — `contracts/actions.ts` (`createContractAction`,
`registerPaymentAction`, `reversePaymentAction`) e
`payers/actions.ts` (`createPayerAction`) tinham exatamente o mesmo
problema, só que nas ações financeiras centrais do produto: qualquer
membro do tenant, inclusive `viewer` (só leitura por design) e
`operator` (spec: "não mexe em contrato"), conseguia criar pagador,
criar contrato, registrar pagamento manual e reverter pagamento.
Confirmado com o usuário antes de prosseguir pra conciliação por
extrato: corrigir agora.

**Decisão:**
- `createContractAction` → `requirePermission(session.role,
  "contracts:write")`.
- `registerPaymentAction`/`reversePaymentAction` → `requirePermission
  (session.role, "payments:write")`.
- `createPayerAction` → `requirePermission(session.role,
  "contracts:write")` — não existe `payers:write` no enum de
  `Permission` (`identity/domain/types.ts`); a spec bundla gestão de
  pagador com gestão de contrato sob Admin ("Cria contratos" já
  pressupõe poder cadastrar quem vai assinar um), e hoje nenhum papel
  tem um dos dois sem o outro (`owner`/`admin` têm ambos,
  `operator`/`viewer` não têm nenhum) — introduzir uma permissão nova
  só pra este caso seria granularidade sem uso real ainda.
- Todas redirecionam com `?error=unauthorized` em falha, mesmo padrão
  de `account/actions.ts`/`review/actions.ts` (decisão [30]).
- Páginas correspondentes (`contracts/page.tsx`, `contracts/new/
  page.tsx`, `contracts/[contractId]/page.tsx`, `payers/page.tsx`,
  `payers/new/page.tsx`) ganharam `canWrite` (mesmo padrão de
  `canWrite`/`canApprove` já usado em `account/page.tsx`/decisão [30])
  — escondem o link/formulário de escrita em vez de mostrar um botão
  que só devolveria erro ao ser clicado. `payers/[payerId]/page.tsx` é
  só leitura, sem forma de escrita — não precisou de gate.

**Alternativas descartadas:** criar `payers:write` dedicado (rejeitada
por ora — nenhum papel hoje precisaria diferenciar os dois; revisar se
um dia existir um papel que só gerencia pagador, não contrato).

**Consequências:** Mesma lacuna de categoria que a decisão [30] já
descreveu, agora fechada nas quatro ações financeiras centrais, não só
na fila de revisão. `tsc`/`eslint`/suite completa confirmados limpos.
Verificação ao vivo da Server Action em si (não só da lógica de
permissão, já testada em `authorization.test.ts`) exigiria navegador —
mesma limitação da decisão [30], não feita aqui. Vale considerar, fora
do escopo desta tarefa, uma auditoria única de TODAS as Server Actions
do projeto pra garantir que não existe uma quinta ação com o mesmo
problema — não feita porque não foi pedida, mas as duas rodadas de
achado (decisões [30] e [31]) sugerem que pode valer a pena.

---

## [32] Fase 5 (fatia 2): conciliação por extrato — módulo `statements`, só CSV, match só por E2E

**Data:** 19/08/2026

**Contexto:** A spec chama a conciliação por extrato de "o melhor
custo-benefício do projeto inteiro" (§8.1, Camada D) — importar o
extrato bancário e casar o E2E ID do comprovante com o crédito real na
conta transforma "parece verdadeiro" em "consta na minha conta". O
usuário escolheu isso como continuação da Fase 5, depois da fatia 1
(módulo `fraud`, decisão [29]). O schema já previa isto desde a
fundação: `payments.origin`/`payments.verification_level` já tinham
`"statement"` no enum (`financial.ts`), nunca usado até agora.

Duas decisões de escopo tomadas com o usuário antes de implementar:
- **Só CSV** nesta fatia — sem dependência nova de parsing (parser
  hand-rolled, `domain/csv-parser.ts`, mesmo espírito de
  `logger.ts`/sessão opaca). OFX/CNAB ficam para uma fatia futura.
- **Linha sem match nunca cria pagamento automaticamente** — fica
  visível numa tela; um humano escolhe pagador/contrato e registra o
  pagamento a partir dela, sempre ação explícita.

**Decisão:**
- **Novo módulo `src/modules/statements/`.** `domain/csv-parser.ts`
  (puro) aceita cabeçalho com sinônimos comuns em português (`data`/
  `histórico`/`valor` e variações), delimitador `,` ou `;` (detectado
  pelo cabeçalho — banco BR com decimal por vírgula quase sempre usa
  `;`, óbvio depois de tentar comma+vírgula-decimal juntos e ver que é
  estruturalmente incompatível: um valor "1.234,56" com vírgula-
  delimitador quebra o próprio campo em dois), valor em formato BR ou
  decimal simples com ponto. Linha de débito (valor ≤ 0) é descartada
  — só crédito importa pra casar com pagamento recebido. Linha
  malformada é descartada individualmente (`skippedRows`), nunca
  derruba o arquivo inteiro.
- **Match só por E2E ID**, extraído da descrição via `extractE2eId`
  (nova export de `ingestion/domain/deterministic-extractor.ts` —
  wrapper fino sobre o `E2E_ID_REGEX` já existente pro comprovante,
  nunca duplicado). Nada de match por valor+data — ambíguo sem mais
  contexto, e a spec descreve o mecanismo como "casa o E2E ID", não
  aproximação.
- **`reconciliation` ganhou três funções novas**
  (`infra/payment-repository.ts`): `findPaymentByTransactionRef`
  (recebe o E2E id bruto, faz o hash internamente — quem chama nunca
  lida com hash); `upgradeVerificationLevelToStatement` ("nível sobe,
  nunca desce" garantido no próprio `WHERE` do UPDATE, não depende de
  disciplina de quem chama — mesmo espírito de RLS/trigger do ledger);
  `executeStatementPayment` (terceira variação de `applyAllocationTx`,
  ao lado de `executeManualPayment`/`executeReceiptPayment` — só troca
  `origin`/`verificationLevel` pra `"statement"`).
- **Achado durante a implementação, corrigido:** `actorType` do
  lançamento de ledger era `params.origin === "manual" ? "user" :
  "system"` — com `origin: "statement"` isso classificaria uma decisão
  100% humana (o caminho manual é SEMPRE um humano escolhendo pagador/
  contrato) como `actorType: "system"` na auditoria. Corrigido pra um
  `Set` `HUMAN_INITIATED_ORIGINS` (`manual`, `statement`) — `receipt`
  continua sendo o único `origin` decidido pelo motor sozinho.
- **UI:** `/t/<slug>/statements` (lista de imports + upload),
  `/t/<slug>/statements/<id>` (linhas: casada automaticamente/manual/
  sem match), `/t/<slug>/statements/<id>/lines/<id>` (mesma UX de
  payer→contract progressivo de `review/[proposalId]/page.tsx`, pro
  caminho manual). Todas as Server Actions checam
  `requirePermission(session.role, "payments:write")` — mesmo padrão
  recém-fechado nas decisões [30]/[31], sem repetir o gap.
- **Schema:** `statement_imports`/`statement_lines`
  (`src/db/schema/statements.ts`, migração `0018_good_alex_power.sql`
  + RLS em `0019_statements_rls.sql`, mesma convenção de
  `0008`/`0015`/`0017`). `matched_payment_id` referencia `payments`
  (nunca o contrário).

**Achado durante os testes, corrigido:** `parseStatementDate` aceitava
qualquer string no formato `dd/mm/aaaa`/`aaaa-mm-dd` sem validar se a
data existe de verdade — `new Date(...)` faz *rollover* silencioso
(mês 13 vira janeiro do ano seguinte) em vez de rejeitar. Uma data
inválida no extrato seria silenciosamente aceita como uma data
diferente, nunca chutar (mesmo espírito §7.4). Corrigido com validação
por round-trip: reconstrói a data e confere se ano/mês/dia batem com o
que foi parseado antes de aceitar.

**Alternativas descartadas:** match por valor+data como fallback
quando não há E2E na descrição (rejeitada — ambíguo, spec descreve o
mecanismo como E2E especificamente); criar pagamento automaticamente
pra linha de crédito sem match (rejeitada pelo usuário — sempre ação
humana explícita); suporte a OFX/CNAB já nesta fatia (rejeitada —
exigiria parser mais robusto/dependência nova, sem dado real pra
testar contra todo banco).

**Consequências:** Verificado ao vivo contra Postgres real (script
descartável, removido ao final, dois cenários): (1) pagamento
`document` existente + linha de extrato com o mesmo E2E na descrição →
`verification_level` sobe pra `statement`, linha marcada `auto_e2e`;
(2) linha sem E2E reconhecível → sem match, humano cria pagamento a
partir dela → `payments.origin`/`verification_level = "statement"`,
linha marcada `manual`. Isolamento cross-tenant das duas tabelas novas
testado contra Postgres real (`tests/security/tenant-isolation-
statements.test.ts`, fixture via `importStatement` real). `pnpm check`
completo (lint + tipos + 330 testes) passa limpo. Fora desta fatia,
registrado em `statements/README.md`: OFX/CNAB, sweep retroativo
(pagamento criado depois de um import não é re-casado contra linhas
antigas sem match), codificação além de UTF-8, perfil de risco por
tenant.

---

## [33] Provedor de e-mail real (Resend) + "esqueci minha senha"

**Data:** 19/08/2026

**Contexto:** Convite e boas-vindas só logavam o link (dev) — nenhum
cliente real recebia e-mail. "Esqueci minha senha" não existia nem
parcialmente (nenhuma tabela, nenhuma tela) — pendência registrada
desde o Marco 2. Perguntado sobre qual provedor (a spec não recomenda
nenhum, mesma situação da AbacatePay/VLM), o usuário escolheu
**Resend**. Confirmado fazer os dois: ligar e-mail real no que já
existia E construir reset de senha do zero. **Sem conta Resend criada
ainda** — implementado contra a API pública documentada (estável:
`POST /emails`, Bearer token), sem verificação ao vivo — mesmo status
do segredo do webhook da AbacatePay antes de existir (decisão [25]).

**Decisão:**
- **`src/shared/email.ts`** (novo) — cliente Resend sem SDK, `fetch`
  cru (mesmo padrão de `abacatepay-client.ts`/Twilio). Fica em
  `shared/` (não em `identity`/`tenant`) porque os dois módulos usam —
  mesmo raciocínio de `logger.ts`/`rate-limit.ts`. `EMAIL_FROM_ADDRESS`
  com default de dev pro sandbox público da própria Resend
  (`onboarding@resend.dev`, funciona sem domínio verificado).
- **"Esqueci minha senha" — mirror quase exato de `invite.ts`/
  `invite-repository.ts`/`accept-invite.ts`** (módulo `identity`), sem
  `tenantId` (reset não é por tenant) e com expiração de 1 hora
  (`PASSWORD_RESET_DURATION_HOURS`) — bem mais curta que convite (3
  dias) ou sessão (7 dias): link de reset parado é superfície de
  ataque, não conveniência. Tabela raiz nova `password_reset_tokens`
  (`0020_silent_mordo.sql`, sem RLS — mesmo motivo de `sessions`/
  `invite_tokens`).
- **`request-password-reset.ts` nunca revela se o e-mail existe** —
  devolve `void` sempre, nunca um `Result` que distinguiria "achei"/
  "não achei"; mesmo cuidado anti-enumeração que `login.ts` já tem
  ("e-mail ou senha incorretos", nunca "e-mail não encontrado"). Rota
  (`api/auth/request-password-reset/route.ts`) tem rate limit por IP e
  por e-mail (`checkRateLimit`, mesma função de `login/route.ts`) —
  evita spam de e-mail e reduz o valor de usar isto como oráculo de
  enumeração; sempre `200 {ok:true}`, inclusive rate-limitado.
- **`reset-password.ts` invalida TODAS as sessões existentes do
  usuário ANTES de criar a nova** (`deleteAllSessionsForUser`, nova
  função em `session-repository.ts`) — se a senha precisou ser
  resetada (possível vazamento), sessões antigas não devem sobreviver.
  Login automático ao final, mesmo raciocínio de `accept-invite.ts`.
  Resposta espelha `login.ts` (lista de tenants via
  `listMembershipsForUser`), não um `tenantSlug` único — reset não é
  ligado a UM convite/tenant.
- **Rotas + telas seguem o padrão API route + client component de
  login/accept-invite** (`/forgot-password`, `/reset-password/
  <token>`), não Server Action — esse é o padrão só de Marco 3+ pra UI
  de produto; auth continua no padrão do Marco 2.
- **E-mail real ligado no que já existia** — `sendWelcomeEmail`
  (`tenant/infra/tenant-repository.ts`) e `sendInviteEmail`
  (`api/team/invite/route.ts`) passam a chamar `sendEmail(...)`, mas
  continuam logando o link/token cru sempre (não só em falha) — é a
  única forma de testar sem depender de caixa de entrada real, ainda
  mais sem conta Resend criada. Nenhuma assinatura de domain/
  application mudou (`invite-user.ts`/`create-tenant.ts` intactos) —
  só a implementação por dentro do dep já injetado.

**Alternativas descartadas:** SendGrid/Postmark (a spec não recomenda
nenhum; Resend escolhida pelo usuário por API mais simples, encaixando
no padrão de client fino já usado no projeto); só ligar e-mail real
sem construir reset de senha (rejeitada pelo usuário — as duas
pendências dependiam do mesmo provedor, fechar juntas evita retrabalho
de configurar tudo de novo depois).

**Consequências:** Verificado ao vivo contra Postgres real (script
descartável, removido ao final — `sendResetEmail` injetado capturando
o token, sem chamar a Resend de verdade): pedido de reset gera token;
pedido para e-mail inexistente completa sem lançar (nunca revela);
confirmar reset atualiza a senha, invalida a sessão antiga, cria
sessão nova, deleta o token (não pode ser reusado). `pnpm check`
completo (lint + tipos + 334 testes, incluindo o primeiro teste de
`application/` deste módulo — exceção deliberada, ordem de invalidação
de sessão é segurança). **Pendência real:** verificação ao vivo contra
a API de verdade da Resend aguarda o usuário criar a conta e passar a
chave — sem isso, `sendEmail` nunca foi exercitado contra rede real
nesta tarefa.

---

## [34] Editar/desativar pagador, editar/cancelar contrato — nunca `DELETE`

**Data:** 19/08/2026

**Contexto:** Marco 3 só entregou criar+ler pagador/contrato — um
cadastro errado não tinha como ser corrigido pela UI. Antes de
implementar, dois limites de escopo confirmados com o usuário:

- **Editar contrato é só metadado** (`description`/`externalRef`) —
  nunca os campos estruturais (`principalCents`/`installmentsCount`/
  `startDate`/`earlyPaymentPolicy`/`toleranceCents`), que já geraram o
  cronograma em `installments` na criação. Editar isso depois
  desincronizaria do que já foi (talvez) pago — fora de escopo,
  exigiria regerar o cronograma inteiro.
- **"Excluir" nunca é `DELETE`** — sempre desativar (pagador) ou
  cancelar (contrato), mesmo espírito de `payments.status: "reversed"`
  (nunca apagado, só marcado). `payers.status`/`contracts.status` já
  existiam no schema desde a fundação (`default("active")`), nunca
  escritos por código nenhum até agora — a coluna já estava pronta,
  só faltava algo escrevendo nela.

**Decisão:**
- **Módulo `payers`**: `updatePayer` (application) reusa
  `validateNewPayer` sem duplicar validação — mesma forma de
  `createPayer`. Infra ganhou `documentHashExistsExcluding` (mesma
  checagem de duplicidade, excluindo o próprio pagador — editar sem
  trocar o documento não deveria "colidir com si mesmo"),
  `savePayerUpdate` (nome com prefixo "save", mesmo padrão de
  `savePayer`/`saveContractWithSchedule`/`saveTenant` — infra sempre
  persiste, o verbo de domínio fica no nome público da application) e
  `setPayerStatus` (toggle `active`/`inactive`, sem cascata pra
  `contracts` — nada no código lê `payers.status`).
- **Módulo `contracts`**: `updateContract` (application) — mesma
  forma, só valida unicidade de `externalRef` excluindo o próprio.
  `cancelContract` (application) rejeita se já `cancelled`; a
  transação de verdade (`cancelContractTx`, infra) trava as parcelas
  (`lockInstallmentsByContractTx`, já existia) e marca `cancelled`
  toda parcela que NÃO estiver `paid` (`updateInstallmentTx`, já
  existia) — parcela paga é fato histórico, nunca tocada. Sem
  lançamento de ledger: mudança de status administrativo, não
  movimento de dinheiro (mesmo raciocínio do upgrade de
  `verification_level` na conciliação por extrato, decisão [32]).
- **UI**: `payers/[payerId]/edit`, `contracts/[contractId]/edit`
  (formulários espelhando `.../new`, campos pré-preenchidos); botões
  "Desativar"/"Reativar" e "Cancelar contrato" nas telas de detalhe.
  Todas as Server Actions novas checam `requirePermission(session.role,
  "contracts:write")` — mesma permissão de criar (não existe
  `payers:write`/permissão dedicada de cancelar, decisão [31]), nunca
  repetindo o gap das decisões [30]/[31]. `StatusChip` ganhou a chave
  `inactive` (pagador desativado); contrato cancelado reusa a chave
  `cancelled` que já existia (hoje só usada por parcela — mesmo
  rótulo/estilo fazem sentido pra contrato, sem inventar cor nova).
- Formulário de registrar pagamento manual/reverter fica escondido
  quando o contrato já está `cancelled` (`isContractActive`,
  `contracts/[contractId]/page.tsx`) — registrar pagamento novo num
  contrato cancelado não faz sentido, mesmo que a alocação
  provavelmente já rejeitasse por falta de parcela elegível.

**Alternativas descartadas:** permitir editar campos estruturais do
contrato com regeração de cronograma (rejeitada pelo usuário — risco
de desincronizar de pagamento já aplicado, escopo maior do que
pedido); `DELETE` real quando não há pagamento nenhum no histórico
(rejeitada pelo usuário — sempre desativar/cancelar, sem excecão);
bloquear cancelamento de contrato 100% pago (não pedido — cancelar um
contrato totalmente pago é inócuo, nenhuma parcela paga é tocada).

**Consequências:** Primeiro teste de `application/` nos módulos
`payers`/`contracts` (mesma exceção deliberada da decisão [33] pra
`reset-password.test.ts` — regra de "excluir o próprio da checagem de
duplicidade" é fácil de acertar errado silenciosamente). Verificado ao
vivo contra Postgres real (script descartável, removido ao final):
criar contrato de 3 parcelas, pagar a primeira, cancelar — parcela
paga continua `paid`, as outras duas viram `cancelled`,
`contracts.status = "cancelled"`; cancelar de novo devolve
`already_cancelled`; editar metadado de pagador/contrato persiste;
desativar/reativar pagador alterna `status` sem tocar `contracts`.
`pnpm check` completo (lint + tipos + 344 testes) passa limpo. Reverter
um cancelamento de contrato (reabrir) não foi pedido — se vier a ser
necessário, é simétrico a "reativar" pagador, fica para quando pedido.
