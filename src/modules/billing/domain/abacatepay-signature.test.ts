import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { validateAbacatePaySignature } from "./abacatepay-signature";

const WEBHOOK_SECRET = "test-webhook-secret-1234567890";
const RAW_BODY = JSON.stringify({
  id: "log_abc123",
  event: "checkout.completed",
  apiVersion: 2,
  devMode: true,
  data: { id: "bill_123456", status: "PAID" },
});

/** Oráculo independente da implementação — mesmo algoritmo descrito na doc, escrito à parte. */
function computeSignature(secret: string, rawBody: string): string {
  return createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");
}

describe("validateAbacatePaySignature", () => {
  it("assinatura válida retorna true", () => {
    const signature = computeSignature(WEBHOOK_SECRET, RAW_BODY);
    expect(validateAbacatePaySignature(WEBHOOK_SECRET, signature, RAW_BODY)).toBe(true);
  });

  it("assinatura adulterada retorna false", () => {
    const signature = computeSignature(WEBHOOK_SECRET, RAW_BODY);
    const tampered = (signature.endsWith("A") ? "B" : "A") + signature.slice(1);
    expect(validateAbacatePaySignature(WEBHOOK_SECRET, tampered, RAW_BODY)).toBe(false);
  });

  it("segredo errado também retorna false", () => {
    const signature = computeSignature(WEBHOOK_SECRET, RAW_BODY);
    expect(validateAbacatePaySignature("outro-segredo-qualquer", signature, RAW_BODY)).toBe(false);
  });

  it("corpo adulterado (mesma assinatura) retorna false", () => {
    const signature = computeSignature(WEBHOOK_SECRET, RAW_BODY);
    const tamperedBody = RAW_BODY.replace("checkout.completed", "checkout.refunded");
    expect(validateAbacatePaySignature(WEBHOOK_SECRET, signature, tamperedBody)).toBe(false);
  });

  it("assinatura de tamanho diferente nunca lança, só devolve false", () => {
    expect(validateAbacatePaySignature(WEBHOOK_SECRET, "abc", RAW_BODY)).toBe(false);
    expect(validateAbacatePaySignature(WEBHOOK_SECRET, "", RAW_BODY)).toBe(false);
  });
});
