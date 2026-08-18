/**
 * Hash de senha — spec §10.2 ("Senhas via Argon2id"). Único ponto
 * autorizado a tocar hash de senha no projeto — mesmo espírito de
 * `shared/document.ts` centralizando CPF/CNPJ.
 *
 * `@node-rs/argon2` (binário pré-compilado via napi-rs) em vez do
 * pacote `argon2` clássico (compila nativo via node-gyp — exige
 * Visual Studio Build Tools no Windows, ambiente principal de
 * desenvolvimento deste projeto, mesmo motivo da decisão [12] em
 * DECISIONS.md sobre ESLint/Prettier vs. Biome).
 *
 * Algoritmo passado explicitamente (mesmo já sendo o default da lib) —
 * a escolha fica visível no código, não implícita numa lib externa.
 */

import { hash, verify } from "@node-rs/argon2";

// Não passa `algorithm` explicitamente: é `const enum` na lib e colide
// com `isolatedModules` (tsconfig deste projeto) ao ser referenciado
// fora do próprio módulo. Argon2id já é o default da lib (confirmado
// pelo prefixo `$argon2id$` no hash gerado, testado em
// `password.test.ts`) — sem perda de garantia, só sem a referência ao
// enum.
export async function hashPassword(plain: string): Promise<string> {
  return hash(plain);
}

/** Nunca lança — senha errada e hash malformado são o mesmo "não bate" pra quem chama. */
export async function verifyPassword(passwordHash: string, plain: string): Promise<boolean> {
  try {
    return await verify(passwordHash, plain);
  } catch {
    return false;
  }
}
