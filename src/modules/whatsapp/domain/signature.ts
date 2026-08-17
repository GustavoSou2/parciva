/**
 * Validação de `X-Twilio-Signature` — CLAUDE.md invariante 11: mecanismo
 * diferente do `X-Hub-Signature-256` da Graph API direta, não confundir
 * os dois. Sem I/O, sem SDK do Twilio (não depender de lib externa numa
 * checagem de segurança) — só `node:crypto`.
 *
 * Algoritmo do Twilio: concatenar a URL com as chaves dos parâmetros
 * ordenadas alfabeticamente, cada uma seguida do próprio valor (sem
 * separador), gerar HMAC-SHA1 com o auth token e comparar o base64 do
 * resultado com a assinatura recebida.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

function buildSignatureBaseString(url: string, params: Record<string, string>): string {
  return Object.keys(params)
    .sort()
    .reduce((acc, key) => `${acc}${key}${params[key] ?? ""}`, url);
}

/**
 * Compara em tempo constante (`timingSafeEqual`) — tamanhos diferentes
 * são rejeitados antes da comparação, sem lançar. O tamanho da
 * assinatura não é segredo (é sempre um digest SHA-1 em base64), então
 * esse curto-circuito não abre canal de timing sobre o auth token.
 */
export function validateTwilioSignature(
  authToken: string,
  signature: string,
  url: string,
  params: Record<string, string>,
): boolean {
  const baseString = buildSignatureBaseString(url, params);
  const expected = createHmac("sha1", authToken).update(baseString, "utf-8").digest("base64");

  const expectedBuffer = Buffer.from(expected, "utf-8");
  const signatureBuffer = Buffer.from(signature, "utf-8");

  return (
    expectedBuffer.length === signatureBuffer.length && timingSafeEqual(expectedBuffer, signatureBuffer)
  );
}
