/**
 * Códigos de recuperação de MFA — uso único, mostrados em claro só uma
 * vez na ativação (spec, critério de aceite da tarefa de MFA). Só o
 * hash é persistido (`hashToken`, mesmo SHA-256 de `token.ts` — os
 * códigos já são gerados com alta entropia própria, não senha
 * escolhida por humano, então não precisam de Argon2/salt por código).
 *
 * Puro — sem I/O; quem persiste é `identity/infra/mfa-repository.ts`.
 */

import { randomInt } from "node:crypto";
import { hashToken } from "./token";

export const RECOVERY_CODE_COUNT = 10;

// Sem 0/O/1/I/L — evita confusão visual ao digitar um código de recuperação à mão.
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const GROUP_LENGTH = 4;
const GROUPS = 2;

function randomGroup(): string {
  let group = "";
  for (let i = 0; i < GROUP_LENGTH; i++) {
    group += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return group;
}

function generateOneCode(): string {
  return Array.from({ length: GROUPS }, randomGroup).join("-");
}

/** Normaliza pra comparação/hash: sem hífen, caixa alta — o usuário pode digitar com ou sem hífen. */
export function normalizeRecoveryCode(code: string): string {
  return code.trim().toUpperCase().replace(/-/g, "");
}

export interface GeneratedRecoveryCode {
  readonly code: string; // formato legível (XXXX-XXXX), mostrado uma única vez
  readonly codeHash: string; // o que é persistido
}

export function generateRecoveryCodes(count: number = RECOVERY_CODE_COUNT): GeneratedRecoveryCode[] {
  return Array.from({ length: count }, () => {
    const code = generateOneCode();
    return { code, codeHash: hashToken(normalizeRecoveryCode(code)) };
  });
}
