# identity

RBAC declarativo (spec §10.2) e resolução de `TenantContext` a partir
de uma sessão autenticada (spec §4.2, Camada 2).

**Invariantes locais:** matriz papel × permissão vive só em
`domain/types.ts` (`ROLE_PERMISSIONS`) — não duplicar em outro módulo.
`canAutoApprove` reflete CLAUDE.md invariante 5: só `admin`/`owner`
aprovam baixa automática.

**Não faz:** não autentica (senha, MFA, sessão) — recebe
`sessionUserId` já validado por quem chama; não consulta o banco
diretamente, só via `deps.getMembership` injetado.
