import { describe, expect, it } from "vitest";
import { isErr, isOk } from "@/shared/result";
import { parseInbound } from "./parser";
import type { TwilioInboundMessage } from "./types";

const BASE: TwilioInboundMessage = {
  From: "whatsapp:+5511999998888",
  To: "whatsapp:+5511888887777",
  MessageSid: "SM1234567890abcdef1234567890abcdef",
};

describe("parseInbound — mídia", () => {
  it("mensagem com mídia é parseada corretamente", () => {
    const result = parseInbound({
      ...BASE,
      NumMedia: "1",
      MediaUrl0: "https://api.twilio.com/media/ME123",
      MediaContentType0: "image/jpeg",
    });

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.kind).toBe("media");
      expect(result.value.from).toBe(BASE.From);
      expect(result.value.messageSid).toBe(BASE.MessageSid);
      expect(result.value.mediaUrl).toBe("https://api.twilio.com/media/ME123");
      expect(result.value.mediaContentType).toBe("image/jpeg");
    }
  });
});

describe("parseInbound — texto", () => {
  it("mensagem de texto é parseada corretamente", () => {
    const result = parseInbound({ ...BASE, Body: "Oi, quero enviar meu comprovante" });

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.kind).toBe("text");
      expect(result.value.body).toBe("Oi, quero enviar meu comprovante");
      expect(result.value.mediaUrl).toBeUndefined();
    }
  });

  it("NumMedia ausente também é tratado como texto", () => {
    const result = parseInbound({ ...BASE, Body: "Oi" });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value.kind).toBe("text");
  });
});

describe("parseInbound — From inválido", () => {
  it("rejeita From sem prefixo whatsapp:", () => {
    const result = parseInbound({ ...BASE, From: "+5511999998888" });
    expect(isErr(result)).toBe(true);
  });
});

describe("parseInbound — mídia sem URL", () => {
  it("rejeita NumMedia > 0 sem MediaUrl0", () => {
    const result = parseInbound({ ...BASE, NumMedia: "1" });
    expect(isErr(result)).toBe(true);
  });
});
