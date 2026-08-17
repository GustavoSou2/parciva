# Parciva

SaaS multi-tenant de conciliação automática de recebíveis.

## O problema

Pequenas e médias empresas brasileiras que parcelam serviços ou vendas
por fora do sistema bancário formal (acordo direto, PIX na chave,
transferência) recebem o comprovante de pagamento por WhatsApp e
conferem tudo manualmente: quem pagou, quanto, em qual parcela dá
baixa. Isso acontece hoje em planilha, agenda ou sistema sem API —
imobiliárias, financeiras pequenas, escolas, clínicas, consórcios
informais, academias, prestadores de serviço recorrente.

É trabalho repetitivo, sujeito a erro humano e a comprovante
fraudado (adulterado, reciclado de outro pagamento, ou simplesmente
falso).

## O que o Parciva faz

O cliente final envia o comprovante pelo WhatsApp. O sistema:

1. **Extrai** os dados do documento (parser determinístico, com
   fallback para VLM barato quando o layout foge do padrão);
2. **Confere** consistência e sinais de fraude (score anti-fraude,
   dedupe por hash, plausibilidade de data e valor);
3. **Identifica** o pagador e o contrato/parcela correspondente;
4. **Aplica a baixa** — ou registra adiantamento/abatimento — num
   ledger append-only e auditável, ou manda para fila de revisão
   humana quando a confiança é baixa.

Toda baixa é rastreável até o comprovante original, a extração, o
modelo de IA usado e a regra determinística aplicada.

### Regra de ouro do produto

> Falso negativo (mandar para revisão humana algo que era válido)
> custa alguns minutos. Falso positivo (dar baixa em comprovante
> falso ou valor errado) custa dinheiro e confiança.

Por isso a IA nunca decide sozinha: ela propõe, e um motor de regras
determinístico dispõe. Na dúvida — confiança baixa, risco alto,
pagador não identificado — vai para revisão humana.

## Valor percebido

- **Elimina a conferência manual** de comprovante, hoje feita por
  humano lendo imagem e cruzando com planilha.
- **Reduz fraude por comprovante forjado**, o vetor mais comum contra
  esse tipo de empresa.
- **Ledger auditável**: toda baixa tem proveniência completa, algo que
  planilha e conferência manual não oferecem.
- **Caminho de crescimento sem retrabalho**: o mesmo motor de
  conciliação atende tanto o comprovante avulso (modelo A, MVP) quanto
  a cobrança PIX emitida pelo próprio Parciva na conta do PSP do
  tenant (modelo B, Fase 6) — o schema já prevê essa origem desde a
  Fase 1.

O Parciva **nunca custodia dinheiro**: não há saque, split ou saldo em
nenhuma hipótese, nem no modelo B.

## Como rodar

### Pré-requisitos

```bash
node --version    # >= 20
pnpm --version    # >= 9   (npm i -g pnpm)
docker --version  # Postgres e Redis locais
```

### Setup

```bash
pnpm install

cp .env.example .env
# preencher DATABASE_URL, REDIS_URL e os segredos gerados com:
openssl rand -base64 32

docker compose -f infra/docker-compose.yml up -d
pnpm db:migrate
pnpm db:seed
```

### Loop diário

```bash
docker compose -f infra/docker-compose.yml up -d   # 1x por sessão
pnpm dev            # terminal 1 — app (http://localhost:3000)
pnpm worker         # terminal 2 — fila (BullMQ + Redis)
pnpm test:watch     # terminal 3 — testes
```

Antes de qualquer commit: `pnpm check` (lint + tipos + testes +
verificação de design tokens).

### Outros comandos úteis

```bash
pnpm db:generate    # gerar migração após mudar schema
pnpm test:tenant    # isolamento entre tenants — nunca pular
pnpm db:reset       # reset + migrate + seed
```

## Documentação

- [`CLAUDE.md`](./CLAUDE.md) — invariantes do projeto que nunca podem ser violadas.
- [`docs/quitou-spec.md`](./docs/quitou-spec.md) — especificação técnica completa.
- [`docs/quitou-setup.md`](./docs/quitou-setup.md) — bootstrap detalhado, estrutura de pastas e infraestrutura de produção.
- [`DECISIONS.md`](./DECISIONS.md) — decisões arquiteturais registradas (ADRs).
- [`PROGRESS.md`](./PROGRESS.md) — status de implementação por fase.
