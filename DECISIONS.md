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
base. Pendência real hoje: **não existe teste automatizado que conecte num
Postgres vivo e exercite essa policy** — `tests/security/` está vazio e o
script `test:tenant` aponta para um arquivo inexistente (ver PROGRESS.md).

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
lançamento. Hoje ainda não existe módulo de aplicação (`src/modules/ledger/`)
que escreva nessa tabela — ela existe no schema e está protegida no banco,
mas nenhum caso de uso a popula ainda.

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
existe — nenhum diretório `corpus/` no repositório hoje). Toda extração
precisa gravar `cost_micros`, mas a tabela `receipt_extractions` que
guardaria isso ainda não existe no schema — é uma pendência para persistir o
resultado da cascata, hoje só logado no console pelo worker.

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
projeto, não algo terceirizado. Hoje `src/shared/storage.ts` (módulo
previsto na estrutura da spec para escrita durável, caminho por hash e
cifra) **ainda não existe** — o diretório `storage/receipts` está criado,
mas nenhum código ainda grava nele seguindo o protocolo de durabilidade
descrito acima.

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
tenant, e a tabela `whatsapp_channels` já está prevista no modelo de dados
(ainda não criada no schema Drizzle). Enquanto o número for compartilhado,
o produto não pode operar mais de um tenant real simultaneamente sem
confundir a origem das mensagens — isso bloqueia a Fase 4 (onboarding
self-service) e precisa ser resolvido antes de qualquer cliente real além
do uso próprio do fundador.

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
