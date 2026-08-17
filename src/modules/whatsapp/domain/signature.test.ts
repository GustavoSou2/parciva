import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { validateTwilioSignature } from "./signature";

const AUTH_TOKEN = "test-auth-token-1234567890";
const URL = "https://example.com/webhooks/twilio/inbound";
const PARAMS: Record<string, string> = {
  From: "whatsapp:+5511999998888",
  To: "whatsapp:+5511888887777",
  Body: "Oi",
  MessageSid: "SM1234567890abcdef1234567890abcdef",
  NumMedia: "0",
};

/** Oráculo independente da implementação — mesmo algoritmo descrito na spec, escrito à parte. */
function computeSignature(authToken: string, url: string, params: Record<string, string>): string {
  const baseString = Object.keys(params)
    .sort()
    .reduce((acc, key) => `${acc}${key}${params[key]}`, url);
  return createHmac("sha1", authToken).update(baseString, "utf-8").digest("base64");
}

describe("validateTwilioSignature", () => {
  it("assinatura válida retorna true", () => {
    const signature = computeSignature(AUTH_TOKEN, URL, PARAMS);
    expect(validateTwilioSignature(AUTH_TOKEN, signature, URL, PARAMS)).toBe(true);
  });

  it("assinatura inválida (adulterada) retorna false", () => {
    const signature = computeSignature(AUTH_TOKEN, URL, PARAMS);
    const tampered = (signature.endsWith("A") ? "B" : "A") + signature.slice(1);
    expect(validateTwilioSignature(AUTH_TOKEN, tampered, URL, PARAMS)).toBe(false);
  });

  it("auth token errado também retorna false", () => {
    const signature = computeSignature(AUTH_TOKEN, URL, PARAMS);
    expect(validateTwilioSignature("outro-token-qualquer", signature, URL, PARAMS)).toBe(false);
  });

  it("params em ordem diferente produzem o mesmo resultado (ordenação alfabética)", () => {
    const signature = computeSignature(AUTH_TOKEN, URL, PARAMS);
    const reordered: Record<string, string> = {
      NumMedia: PARAMS.NumMedia ?? "",
      Body: PARAMS.Body ?? "",
      From: PARAMS.From ?? "",
      MessageSid: PARAMS.MessageSid ?? "",
      To: PARAMS.To ?? "",
    };
    expect(validateTwilioSignature(AUTH_TOKEN, signature, URL, reordered)).toBe(true);
  });

  it("comparação em tempo constante não lança com buffers de tamanho diferente", () => {
    expect(() => validateTwilioSignature(AUTH_TOKEN, "abc", URL, PARAMS)).not.toThrow();
    expect(validateTwilioSignature(AUTH_TOKEN, "abc", URL, PARAMS)).toBe(false);

    const muchLonger = `${computeSignature(AUTH_TOKEN, URL, PARAMS)}-bytes-extras-para-mudar-o-tamanho`;
    expect(() => validateTwilioSignature(AUTH_TOKEN, muchLonger, URL, PARAMS)).not.toThrow();
    expect(validateTwilioSignature(AUTH_TOKEN, muchLonger, URL, PARAMS)).toBe(false);
  });
});
