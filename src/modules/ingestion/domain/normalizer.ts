/**
 * Preparação do arquivo antes de qualquer extração — spec §7.1 (Tier 0).
 * Sem I/O: tudo aqui opera sobre `Buffer` em memória, nunca lê disco,
 * rede ou banco. `sharp` e `node:crypto` são só computação sobre bytes
 * já recebidos por quem chamou (mesmo padrão de `shared/document.ts`
 * usando `node:crypto` para hash).
 */

import { createHash } from "node:crypto";
import sharp from "sharp";
import type { Result } from "@/shared/result";
import { err, ok } from "@/shared/result";

const MAX_DIMENSION = 1600;

/**
 * Detecta o MIME real por magic bytes — nunca confia na extensão ou no
 * `Content-Type` declarado (podem mentir; magic bytes não). Cobre só os
 * formatos que o pipeline sabe processar; qualquer outro é `Err`, para
 * cair em revisão em vez de seguir com um arquivo não suportado.
 */
export function normalizeMime(buffer: Buffer): Result<string, string> {
  if (buffer.length === 0) {
    return err("Buffer vazio — não é possível detectar o tipo do arquivo.");
  }

  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return ok("image/jpeg");
  }

  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return ok("image/png");
  }

  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return ok("image/webp");
  }

  if (buffer.length >= 5 && buffer.toString("ascii", 0, 5) === "%PDF-") {
    return ok("application/pdf");
  }

  return err(
    `Tipo de arquivo não suportado — magic bytes desconhecidos: ${buffer
      .subarray(0, 8)
      .toString("hex")}`,
  );
}

/**
 * Normaliza imagem para o formato que o resto do pipeline espera:
 * converte para JPEG (cobre HEIC/WebP/PNG de entrada), redimensiona o
 * lado maior para no máximo 1600px mantendo proporção (sem ampliar
 * imagem menor) e remove EXIF. `.rotate()` sem argumento aplica a
 * orientação do EXIF nos pixels ANTES de descartar os metadados — sem
 * isso, foto tirada em retrato vira paisagem depois do strip.
 *
 * Preservar o binário original para perícia (spec §8) é responsabilidade
 * de quem chama — este módulo só devolve a versão normalizada.
 */
export async function normalizeImage(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .rotate()
    .resize({
      width: MAX_DIMENSION,
      height: MAX_DIMENSION,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg()
    .toBuffer();
}

/** SHA-256 hex do buffer — `content_hash` do storage e chave de dedupe (spec §5.3, §7.1 Tier 0). */
export function computeHash(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}
