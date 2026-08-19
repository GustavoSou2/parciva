# ADR-0001: Isolamento multi-tenant via RLS em banco único

**Status:** Aceito
**Data:** Agosto 2026 (spec v1.0 §4.1; implementado em `0bd9205`)

## Contexto

O produto isola dados de múltiplos tenants com um time de uma pessoa e
sem orçamento para infraestrutura por cliente. Vazamento cross-tenant
é o pior bug possível — dado financeiro de uma empresa aparecendo para
outra.

## Decisão

Banco único, schema único, isolamento por `tenant_id` + Row Level
Security no Postgres, com defesa em profundidade em 4 camadas:

1. RLS com `FORCE ROW LEVEL SECURITY` no banco (policy `tenant_isolation`
   em toda tabela de domínio).
2. `TenantContext` obrigatório em `src/db/client.ts` — nenhum código de
   domínio usa cliente cru.
3. Suite de testes de vazamento cross-tenant no CI (`tests/security/`).
4. Caminho de storage sempre prefixado por `tenant_id`.

`tenants`, `users`, `plans` e outras tabelas de bootstrap (`sessions`,
`invite_tokens`, `whatsapp_channels`) ficam de fora por design — são
tabelas raiz, resolver quem é o tenant/usuário precisa acontecer antes
de existir um `tenant_id` para aplicar a policy.

## Alternativas consideradas

- **Schema-por-tenant** — custo operacional de migração cresce
  linearmente com o número de clientes.
- **Banco-por-tenant** — inviável para plano grátis e para um único
  desenvolvedor operar.

## Consequências

RLS precisa estar ativa desde o primeiro schema — retrofit depois é
uma das refatorações mais caras e arriscadas que existem. Se um
cliente enterprise exigir isolamento físico, a resposta é deploy
dedicado, não mudar a arquitetura base.

Camada 1 só é real se o role de aplicação NÃO for superusuário —
superusuário ignora RLS incondicionalmente, mesmo com `FORCE`. Isso
foi verificado tarde demais numa iteração posterior e corrigido (ver
DECISIONS.md [13] para o incidente completo e a correção — role
`parciva_app` não-superusuário, `NOSUPERUSER NOBYPASSRLS`).

Toda tabela nova com `tenant_id` precisa da mesma policy desde a
migração que a cria — nunca depois. `DECISIONS.md` registra cada
tabela nova e sua RLS ao longo do projeto (ex.: [21], [29], [32]).
