# admin

Tipos de domínio do painel de superadmin (spec §12) — `TenantSummary`,
`GlobalMetrics`, `AdminAction`. Ainda sem `application/`/`infra/`: quem
lê o banco de verdade é `src/app/admin/_lib/queries.ts` (fora deste
módulo, de propósito — ver abaixo), não este módulo.

**Não faz:** não implementa a regra de quebra-vidro (justificativa,
janela de acesso, notificação ao Owner — spec §12), nem auditoria, nem
autenticação — tudo isso é tarefa futura. `src/db/admin-client.ts` só
pode ser importado por `src/app/admin/**`, nunca por este módulo — é
por isso que `_lib/queries.ts` mora do lado de fora, junto das páginas.

**Resolvido (18/08/2026):** a pasta virou `src/app/admin/` (era
`(admin)`, grupo de rota — colidia com `src/app/page.tsx` em `/`, o
Next.js nunca servia o dashboard). `/admin` e `/admin/tenants` agora
mostram dado real, via `getAdminDb()`.

**Ainda pendente, deliberadamente fora de escopo:** roteamento por
subdomínio de verdade (spec §12, exigido antes de produção — `/admin`
como path é o desbloqueio mínimo, não o alvo final); MFA/login
independente (auth continua `x-admin-secret`); quebra-vidro completo;
impersonação; feature flags; fila de DLQ; ações (mudar plano,
suspender, conceder crédito). Ver DECISIONS.md.
