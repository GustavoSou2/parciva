/**
 * Tipos puros do canal WhatsApp via Twilio — spec §9.2 (recepção).
 * Sem I/O: nenhuma função aqui lê rede, banco ou fila.
 */

/**
 * Payload do webhook do Twilio (`application/x-www-form-urlencoded`,
 * sempre string). Modela só os campos que este módulo usa — o payload
 * real do Twilio traz mais campos (AccountSid, ApiVersion, WaId, etc.);
 * ver nota de limitação em `application/handle-inbound.ts`.
 */
export interface TwilioInboundMessage {
  readonly From: string;
  readonly To: string;
  readonly Body?: string;
  readonly MessageSid: string;
  readonly NumMedia?: string;
  readonly MediaUrl0?: string;
  readonly MediaContentType0?: string;
}

/** Classificação da mensagem recebida — spec §9.3 (estados do bot). */
export type InboundKind = "media" | "text";

/** Saída normalizada de `parseInbound` — o que o resto do módulo consome. */
export interface ParsedInbound {
  readonly kind: InboundKind;
  readonly from: string;
  readonly messageSid: string;
  readonly body?: string;
  readonly mediaUrl?: string;
  readonly mediaContentType?: string;
}
