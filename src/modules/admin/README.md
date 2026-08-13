# admin

Tipos de domínio do painel de superadmin (spec §12) — `TenantSummary`,
`GlobalMetrics`, `AdminAction`. Ainda sem `application/`/`infra/`: as
páginas em `src/app/(admin)/` são stub e não consomem estes tipos
ainda.

**Não faz:** não implementa a regra de quebra-vidro (justificativa,
janela de acesso, notificação ao Owner — spec §12), nem auditoria, nem
autenticação — tudo isso é tarefa futura. `src/db/admin-client.ts` só
pode ser importado por `src/app/(admin)/**`, nunca por este módulo.

**Pendência conhecida:** `(admin)/page.tsx` colide com `src/app/page.tsx`
em `/` — o Next.js serve o placeholder existente, não o dashboard.
Precisa de roteamento por subdomínio (spec §12) antes de ir pra produção.
