/**
 * Storage de comprovantes em filesystem local — spec §3.4, invariante 12
 * (sem AWS/S3, endereçado por content_hash, nunca por caminho vindo de
 * input do usuário).
 *
 * v1 deliberadamente mínima: escreve em arquivo temporário e faz
 * `rename` atômico (garantia do próprio filesystem — nunca fica um
 * arquivo parcialmente escrito no caminho final). NÃO implementa ainda
 * o protocolo completo de durabilidade que a spec descreve (fsync do
 * arquivo + fsync do diretório antes do commit no banco) — isso é
 * pendência registrada em DECISIONS.md [7], não um bug escondido aqui.
 */

import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

function storageRoot(): string {
  return process.env.STORAGE_ROOT ?? path.join(process.cwd(), "storage", "receipts");
}

/**
 * Caminho relativo (storage_key) para um comprovante: `<tenant_id>/<aa>/<bb>/<content_hash>.<ext>`.
 * O prefixo por tenant_id é a invariante 3 aplicada ao storage — nunca um
 * caminho compartilhado entre tenants. Sempre com `/`, nunca
 * `path.join` — `storage_key` é um identificador lógico gravado no banco
 * (usado depois para montar `X-Accel-Redirect` no Nginx, spec §3.4), não
 * um argumento de filesystem: precisa ser igual em dev (Windows) e
 * produção (VPS Linux), independente do separador nativo do SO.
 */
function receiptStorageKey(tenantId: string, contentHash: string, ext: string): string {
  const aa = contentHash.slice(0, 2);
  const bb = contentHash.slice(2, 4);
  return `${tenantId}/${aa}/${bb}/${contentHash}.${ext}`;
}

/**
 * Grava o buffer do comprovante no caminho endereçado por conteúdo e
 * devolve o `storage_key` relativo (o que vai em `receipts.storage_key`).
 * Idempotente por construção: se o arquivo final já existe (mesmo hash),
 * o rename simplesmente o sobrescreve com bytes idênticos.
 */
export async function saveReceiptFile(
  tenantId: string,
  contentHash: string,
  ext: string,
  buffer: Buffer,
): Promise<string> {
  const root = storageRoot();
  const storageKey = receiptStorageKey(tenantId, contentHash, ext);
  const finalPath = path.join(root, storageKey);
  const tmpPath = path.join(root, `.tmp-${randomUUID()}`);

  await mkdir(path.dirname(finalPath), { recursive: true });
  await writeFile(tmpPath, buffer);
  await rename(tmpPath, finalPath);

  return storageKey;
}

/**
 * Lê o comprovante de volta — usado pela fila de revisão (Marco 5,
 * `/t/<slug>/receipts/<id>/file`) para mostrar o arquivo original.
 * `storageKey` chega SEMPRE do banco (nunca de input bruto do usuário —
 * invariante 12), então não há travessia de caminho a validar aqui: quem
 * chama já filtrou por `tenant_id` antes de ler o `storage_key`.
 *
 * Em produção, isto deveria virar `X-Accel-Redirect` pro Nginx (decisão
 * [7]) — não há Nginx em dev, então a rota lê e devolve o buffer direto;
 * dívida registrada, não escondida.
 */
export async function readReceiptFile(storageKey: string): Promise<Buffer> {
  const root = storageRoot();
  return readFile(path.join(root, storageKey));
}
