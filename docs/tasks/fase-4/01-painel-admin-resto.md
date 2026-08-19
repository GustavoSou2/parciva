# Painel de superadmin — resto da spec §12

**Módulo:** `src/app/admin`
**Spec:** `docs/quitou-spec.md` §12
**Depende de:** `getAdminDb()` (já existe, `db/admin-client.ts`), rota `/admin` funcional com dado real (DECISIONS.md [24])

## Objetivo

O painel hoje mostra dashboard + lista de tenants com dado real, mas
segue com escopo mínimo por decisão explícita do usuário (DECISIONS.md
[24]). Fechar o resto da spec §12 quando priorizado.

## Critérios de aceite

- [ ] Subdomínio real (hoje é só path `/admin`, desbloqueio mínimo —
      não o alvo final)
- [ ] MFA/login independente do superadmin (hoje `x-admin-secret`,
      placeholder documentado desde antes)
- [ ] Quebra-vidro auditado: justificativa + janela de acesso +
      notificação ao Owner antes de qualquer ação sensível
- [ ] Registro em `audit_logs` a cada acesso (TODO já existe em
      `admin-client.ts`)
- [ ] Impersonação (logar como um tenant específico pra suporte)
- [ ] Feature flags por tenant
- [ ] Fila de DLQ com replay manual
- [ ] Ações: mudar plano, suspender, conceder crédito
- [ ] Busca por tenant/contrato/comprovante

## Fora de escopo

Nenhum destes itens é urgente pra operar com o cliente atual — esta
tarefa é pra quando o segundo/terceiro cliente real chegar e a
superfície de risco do "resto pendente" deixar de ser aceitável.
