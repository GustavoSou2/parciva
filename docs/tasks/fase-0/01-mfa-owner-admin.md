# MFA para owner/admin

**Módulo:** `src/modules/identity`
**Spec:** `docs/quitou-spec.md` §10.2 (ler antes — MFA obrigatório pra owner/admin)
**Depende de:** autenticação básica (já existe — sessão opaca, Argon2id, decisão [15] em `DECISIONS.md`)
**Decisões relevantes:** `docs/adr/` ainda não tem ADR próprio pra autenticação — ver DECISIONS.md [15]

## Objetivo

TOTP completo pra owner/admin: gerar segredo, mostrar QR code no
onboarding/configurações, validar código de 6 dígitos no login,
códigos de recuperação de uso único caso o usuário perca o
autenticador.

`users.mfaEnabled`/`users.mfaSecretRef` já existem no schema desde a
fundação, nunca escritos por código nenhum — `mfaSecretRef` é
ponteiro pro cofre, nunca o segredo em claro (CLAUDE.md invariante 7).

## Critérios de aceite

- [ ] Gerar segredo TOTP + QR code (biblioteca a decidir — avaliar
      contra o padrão do projeto de client fino/sem SDK pesado quando
      possível)
- [ ] Ativar MFA grava só a referência ao segredo, nunca o segredo em
      claro no banco
- [ ] Login de owner/admin com MFA ativo exige o código de 6 dígitos
      antes de criar sessão
- [ ] Códigos de recuperação de uso único, gerados na ativação,
      cada um invalidado após o uso
- [ ] Desativar MFA exige senha atual (não é um toggle sem fricção)
- [ ] Teste de propriedade pra geração/validação de código TOTP

## Fora de escopo

MFA obrigatório pra operator/viewer (spec só exige pra owner/admin).
Painel de superadmin tem MFA próprio, separado — ver
`docs/tasks/fase-4/01-painel-admin-resto.md`.
