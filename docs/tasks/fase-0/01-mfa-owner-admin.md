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

- [x] Gerar segredo TOTP + QR code (biblioteca a decidir — avaliar
      contra o padrão do projeto de client fino/sem SDK pesado quando
      possível). Resolvido: TOTP hand-rolled (`identity/domain/
      totp.ts`, `node:crypto`, validado contra o vetor de teste
      oficial RFC 4226 Apêndice D); QR usa a dependência `qrcode`
      (única — gerar QR não é pequeno o bastante pra reimplementar,
      diferente do TOTP em si). Ver DECISIONS.md [36].
- [x] Ativar MFA grava só a referência ao segredo, nunca o segredo em
      claro no banco. Resolvido: `src/shared/crypto.ts` (novo,
      AES-256-GCM sobre `ENCRYPTION_KEY`) cifra o segredo antes de
      `mfaSecretRef` ser gravado — "cofre local" do invariante 7,
      já que o projeto não tem vault separado (ADR-9).
- [x] Login de owner/admin com MFA ativo exige o código de 6 dígitos
      antes de criar sessão. Resolvido: `login()` devolve um challenge
      stateless (`identity/domain/mfa-challenge.ts`) em vez de sessão
      quando `mfaEnabled`; `POST /api/auth/mfa-verify` (novo) exige o
      código antes de criar a sessão de verdade. Mecanismo vale pra
      qualquer usuário com MFA ativo, não só owner/admin — enforcement
      obrigatório especificamente pra esses dois papéis ficou fora de
      escopo desta fatia (decisão do usuário, ver "Fora de escopo").
- [x] Códigos de recuperação de uso único, gerados na ativação, cada
      um invalidado após o uso. Resolvido: tabela `mfa_recovery_codes`
      (só hash gravado), `consumeRecoveryCode` atômico contra reuso.
- [x] Desativar MFA exige senha atual (não é um toggle sem fricção).
      Resolvido: `disableMfaWithPassword`, `/account/security`.
- [x] Teste de propriedade pra geração/validação de código TOTP.
      Resolvido: `identity/domain/totp.test.ts`.

## Fora de escopo

MFA obrigatório pra operator/viewer (spec só exige pra owner/admin).
Painel de superadmin tem MFA próprio, separado — ver
`docs/tasks/fase-4/01-painel-admin-resto.md`. **Adicionado nesta
rodada, por decisão do usuário:** forçar owner/admin a ativar — o
mecanismo ficou pronto opt-in pra qualquer conta, mas nenhuma conta
existente é bloqueada até ativar (evita travar login sem aviso prévio,
inclusive de quem já usa o produto hoje). Fica como próxima fatia,
quando fizer sentido decidir como nagear/exigir.
