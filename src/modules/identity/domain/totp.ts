/**
 * TOTP — RFC 6238 sobre HOTP (RFC 4226). Hand-rolled: o algoritmo é
 * HMAC-SHA1 + truncamento dinâmico, pequeno o bastante pra não
 * justificar dependência (mesmo raciocínio de `identity/domain/
 * session.ts` — CSRF via HMAC sem lib). Gerar o QR code em si já é
 * outra história (não-trivial), por isso usa a dependência `qrcode`
 * só na camada de aplicação/UI, nunca aqui.
 *
 * Puro — sem I/O, sem `Date.now()` direto (recebe `at` como parâmetro,
 * pra ser testável determinístico).
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const STEP_SECONDS = 30;
const CODE_DIGITS = 6;
const SECRET_BYTES = 20; // 160 bits — tamanho recomendado pela RFC 4226 pra HMAC-SHA1
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function generateTotpSecret(): Buffer {
  return randomBytes(SECRET_BYTES);
}

export function base32Encode(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 0x1f];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 0x1f];
  }
  return output;
}

export function base32Decode(encoded: string): Buffer {
  const clean = encoded.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const charValue = BASE32_ALPHABET.indexOf(char);
    if (charValue === -1) continue;
    value = (value << 5) | charValue;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** `otpauth://` — formato padrão que Google Authenticator/Authy/1Password etc. leem via QR. */
export function buildOtpauthUri(secret: Buffer, accountEmail: string, issuer = "Parciva"): string {
  const label = encodeURIComponent(`${issuer}:${accountEmail}`);
  const params = new URLSearchParams({
    secret: base32Encode(secret),
    issuer,
    algorithm: "SHA1",
    digits: String(CODE_DIGITS),
    period: String(STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

function counterAt(at: Date): bigint {
  return BigInt(Math.floor(at.getTime() / 1000 / STEP_SECONDS));
}

/** HOTP (RFC 4226) — HMAC-SHA1 do contador (8 bytes big-endian) + truncamento dinâmico → N dígitos. */
export function computeTotpCode(secret: Buffer, counter: bigint): string {
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(counter);

  const hmac = createHmac("sha1", secret).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const binary =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);

  const code = binary % 10 ** CODE_DIGITS;
  return code.toString().padStart(CODE_DIGITS, "0");
}

export function generateTotpCode(secret: Buffer, at: Date = new Date()): string {
  return computeTotpCode(secret, counterAt(at));
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export interface VerifyTotpOptions {
  /** Quantos passos de 30s pra cada lado tolerar (drift de relógio do celular). 1 = ±30s. */
  readonly windowSteps?: number;
}

/** Aceita o código do passo atual e de `windowSteps` passos antes/depois — celular com relógio levemente errado ainda funciona. */
export function verifyTotpCode(
  secret: Buffer,
  code: string,
  at: Date = new Date(),
  options: VerifyTotpOptions = {},
): boolean {
  const windowSteps = options.windowSteps ?? 1;
  const normalizedCode = code.trim();
  if (!/^\d{6}$/.test(normalizedCode)) return false;

  const currentCounter = counterAt(at);
  for (let delta = -windowSteps; delta <= windowSteps; delta++) {
    const candidate = computeTotpCode(secret, currentCounter + BigInt(delta));
    if (safeEqual(candidate, normalizedCode)) return true;
  }
  return false;
}
