# ADR-0006: Cada tenant conecta o próprio número de WhatsApp

**Status:** Aceito como arquitetura-alvo — **não implementado ainda** (ver "Estado atual")
**Data:** Agosto 2026 (spec v1.0 §9.1)

## Contexto

Concentrar todo tráfego de todos os tenants num único número de
WhatsApp concentra risco de reputação: um tenant que gera muita
denúncia/spam pode fazer a Meta banir o número, derrubando o canal de
todos os outros tenants ao mesmo tempo.

## Decisão

Cada tenant deve conectar o próprio número via Embedded Signup, sobre
o BSP escolhido — Twilio (ver contexto abaixo). O schema já prevê isso
desde a fundação: `whatsapp_channels` guarda o `phone_number_id` de
cada tenant, e a resolução de tenant a partir de `payload.To` no
webhook já está implementada de verdade (não é mais TODO).

**Por que Twilio como BSP:** a spec recomendava a API oficial da Meta
direta ou via um BSP (360dialog, Twilio, Gupshup, Z-API), nunca
WhatsApp Web ou biblioteca não oficial — risco de banimento do número
do cliente. Twilio foi escolhido; todo webhook é validado por
`X-Twilio-Signature` (HMAC) antes de qualquer processamento —
mecanismo diferente do `X-Hub-Signature-256` da Graph API direta da
Meta, não confundir os dois (CLAUDE.md invariante 11). Envio e
download de mídia usam a REST API do Twilio via `fetch` direto, não o
SDK `twilio` (que está instalado mas não é importado em nenhum
arquivo).

## Estado atual (desvio temporário, não a arquitetura final)

O projeto opera hoje com **um único número Twilio compartilhado**
(`TWILIO_WHATSAPP_FROM`). Implementar onboarding de número por tenant
depende de fluxo de Embedded Signup que ainda não foi construído.

## Alternativas consideradas

- **WhatsApp Cloud API direta da Meta** — descartada em favor do BSP
  (redução de complexidade de onboarding).
- **WhatsApp Web ou automação não oficial** — descartada pela spec,
  risco de banimento.
- **Implementar onboarding por tenant já nas fases iniciais** —
  descartado por ordem de dependência (exigia `whatsapp_channels` e
  resolução de tenant real, que só chegaram depois).

## Consequências

Enquanto o número for compartilhado, o produto não pode operar mais de
um tenant real simultaneamente sem confundir a origem das mensagens —
isso bloqueia onboarding self-service via WhatsApp para múltiplos
tenants reais. Ver DECISIONS.md [11] para o histórico completo da
transição (TODO fechado, resolução de tenant real implementada) e
`docs/tasks/fase-3/` para a tarefa de implementar o Embedded Signup
por tenant quando for priorizado.
