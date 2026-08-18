/**
 * Validação de `X-Webhook-Signature` da AbacatePay — mesmo espírito de
 * `whatsapp/domain/signature.ts` (sem SDK, só `node:crypto`,
 * comparação em tempo constante). Algoritmo (docs.abacatepay.com/
 * pages/webhooks): HMAC-SHA256 do corpo BRUTO da requisição, digest em
 * base64, comparado com o header — usando a "chave pública" do webhook
 * (gerada no dashboard da AbacatePay ao criar o endpoint, NUNCA a
 * `ABACATE_PAY_API_KEY`/`ABACATE_PAY_DEV_API_KEY` que autentica
 * requisição SAÍDA — são duas chaves diferentes, uma pra cada
 * direção).
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export function validateAbacatePaySignature(
  webhookSecret: string,
  signature: string,
  rawBody: string,
): boolean {
  const expected = createHmac("sha256", webhookSecret).update(rawBody, "utf8").digest("base64");

  const expectedBuffer = Buffer.from(expected, "utf8");
  const signatureBuffer = Buffer.from(signature, "utf8");

  return (
    expectedBuffer.length === signatureBuffer.length && timingSafeEqual(expectedBuffer, signatureBuffer)
  );
}
