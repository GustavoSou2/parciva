# Criptografia de coluna — documento e telefone do pagador

**Módulo:** `src/shared` (novo `crypto.ts`) + `src/modules/payers`
**Spec:** `docs/quitou-spec.md` §5.6/§10 (dado pessoal de pagador)
**Depende de:** nada — pode começar isolado

## Objetivo

Hoje `payers.document`/`payers.phoneE164` ficam em texto claro no
banco (só `documentHash` é protegido, e só serve pra dedupe/match, não
pra recuperar o valor original). Um dump/vazamento do banco expõe CPF/
CNPJ e telefone de todo pagador de todo tenant.

`src/shared/crypto.ts` não existe ainda — criar cifra simétrica
(campo cifrado + referência de chave, nunca a chave junto do dado,
mesmo raciocínio de `ENCRYPTION_KEY`/`FILE_ENCRYPTION_KEY` já
presentes no `.env.example` sem uso ainda).

## Critérios de aceite

- [ ] `encryptField`/`decryptField` puros em `shared/crypto.ts`,
      testados com propriedade (roundtrip nunca perde dado)
- [ ] Migração expand → migrar dados → contract (nunca destrutiva em
      um passo, CLAUDE.md): coluna cifrada nova ao lado da atual,
      backfill, só então remover a antiga
- [ ] `document`/`phoneE164` cifrados em repouso; `documentMasked`
      continua em claro (é dado já mascarado, não sensível na mesma
      medida — usado pra exibição em toda tela)
- [ ] `documentHash` continua como está — é derivado do valor
      normalizado antes da cifra, não afetado
- [ ] Rotação de chave documentada (mesmo que não automatizada nesta
      tarefa)

## Fora de escopo

Criptografia de outras colunas sensíveis fora de `payers` (avaliar
separadamente se necessário). Rotação automática de chave.
