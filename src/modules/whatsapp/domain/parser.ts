/**
 * Normaliza o payload bruto do webhook num `ParsedInbound` — spec §9.2/§9.3.
 * Sem I/O: só interpreta os campos já recebidos.
 */

import type { Result } from "@/shared/result";
import { err, ok } from "@/shared/result";
import type { ParsedInbound, TwilioInboundMessage } from "./types";

export function parseInbound(payload: TwilioInboundMessage): Result<ParsedInbound, string> {
  if (!payload.From.startsWith("whatsapp:")) {
    return err(`From inválido — esperado prefixo "whatsapp:", recebido: "${payload.From}".`);
  }

  const numMedia = Number(payload.NumMedia ?? "0");

  if (numMedia > 0) {
    if (!payload.MediaUrl0) {
      return err("NumMedia > 0 mas MediaUrl0 está ausente.");
    }
    return ok({
      kind: "media",
      from: payload.From,
      messageSid: payload.MessageSid,
      mediaUrl: payload.MediaUrl0,
      ...(payload.MediaContentType0 ? { mediaContentType: payload.MediaContentType0 } : {}),
    });
  }

  return ok({
    kind: "text",
    from: payload.From,
    messageSid: payload.MessageSid,
    ...(payload.Body ? { body: payload.Body } : {}),
  });
}
