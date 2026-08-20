/**
 * Cifra local de segredo — CLAUDE.md invariante 7 ("segredo nunca no
 * banco em claro — só referência ao cofre local"). O projeto não tem
 * (nem terá, por ora — ADR-9, auto-hospedado sem serviço de nuvem
 * gerenciado) um vault separado tipo HashiCorp Vault. O "cofre" aqui é
 * `ENCRYPTION_KEY` (variável de ambiente, documentada desde
 * `docs/quitou-setup.md` — `openssl rand -base64 32` — nunca usada até
 * agora): a coluna no banco guarda só o ciphertext; quem destrava é a
 * chave, que vive fora do banco (env hoje, `systemd credentials` em
 * produção — spec §10.2). Um dump de banco sozinho não expõe nada.
 *
 * AES-256-GCM — autenticado (detecta ciphertext adulterado, não só
 * decifra). Puro — só `node:crypto`, mesmo espírito de
 * `identity/domain/session.ts`.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32;
const IV_BYTES = 12; // padrão do GCM — 96 bits

export class CryptoError extends Error {}

function loadKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) throw new CryptoError("ENCRYPTION_KEY não configurada.");
  const key = Buffer.from(raw, "base64");
  if (key.length !== KEY_BYTES) {
    throw new CryptoError(`ENCRYPTION_KEY precisa decodificar para ${KEY_BYTES} bytes (base64 de 32 bytes).`);
  }
  return key;
}

/** `iv:authTag:ciphertext`, cada parte em base64url — IV aleatório a cada chamada, nunca reusado. */
export function encryptSecret(plaintext: string): string {
  const key = loadKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv, authTag, ciphertext].map((part) => part.toString("base64url")).join(":");
}

export function decryptSecret(stored: string): string {
  const key = loadKey();
  const parts = stored.split(":");
  if (parts.length !== 3) {
    throw new CryptoError("Formato inválido de segredo cifrado (esperado iv:authTag:ciphertext).");
  }
  const [ivPart, tagPart, dataPart] = parts as [string, string, string];
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivPart, "base64url"));
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(dataPart, "base64url")), decipher.final()]);
  return plaintext.toString("utf8");
}
