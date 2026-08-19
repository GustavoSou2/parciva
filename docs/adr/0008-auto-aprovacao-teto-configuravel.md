# ADR-0008: Auto-aprovação com teto de valor configurável, padrão conservador

**Status:** Aceito
**Data:** Agosto 2026 (spec v1.0 §6.6; implementado no Marco 4)

## Contexto

Auto-aplicar um pagamento com base num comprovante é a proposta
central do produto, mas é também o ponto de maior risco de falso
positivo (CLAUDE.md invariante 5: "na dúvida, revisão humana"). Um
teto de valor limita o dano de qualquer decisão automática errada,
independente de quão bem-calibradas as outras condições estejam.

## Decisão

`decideAutoApply` (`reconciliation/domain/auto-apply-decision.ts`) só
auto-aplica quando o valor do pagamento está dentro do teto de
auto-aprovação do tenant — `tenants.settings.autoApprovalCeilingCents`
(JSONB, não coluna própria: é a única configuração desse tipo até
agora), com default conservador de R$ 5.000 quando o tenant não
configurou nada (`DEFAULT_AUTO_APPROVAL_CEILING_CENTS`,
`tenant/infra/tenant-repository.ts`). Valor acima do teto cai em
`needs_review`, nunca em `rejected` — falha de condição nunca rejeita
automaticamente.

## Alternativas consideradas

- **Teto fixo, não configurável por tenant** — rejeitado, tenants têm
  volumes de negócio muito diferentes; um teto único seria muito
  permissivo pra um tenant pequeno ou muito restritivo pra um grande.
- **Sem teto, confiar só em confiança + identificação forte** —
  rejeitado, risco/fraude (ADR ainda no-op até a Fase 5 avançar) não
  compensa sozinho; o teto é uma segunda barreira independente.

## Consequências

O teto é uma das seis condições reais de `decideAutoApply` junto com
confiança ≥ 0,90, identificação forte, alocação sem sobra, data
plausível e (desde a Fase 5 fatia 1) ausência de bloqueio por fraude —
ver DECISIONS.md [17]/[29]. Nenhuma UI de configuração de tenant para
esse valor existe ainda; hoje só é ajustável direto no banco
(`tenants.settings`).
