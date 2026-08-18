/**
 * Caso de uso que processa uma mensagem recebida no webhook do Twilio —
 * spec §9.2/§9.3. Toda dependência externa (auth token, dedupe, download
 * de mídia, fila, resposta) entra via `HandleInboundDeps`; este arquivo
 * nunca importa `db`, storage ou HTTP diretamente.
 *
 * `TwilioInboundMessage` modela só os campos que este módulo usa, não o
 * payload completo que o Twilio envia (AccountSid, ApiVersion, WaId,
 * etc.). Por isso a assinatura é validada contra `rawParams` — o body
 * COMPLETO do form recebido pelo endpoint HTTP — e não contra `payload`:
 * o Twilio calcula o HMAC sobre todos os parâmetros do POST, então
 * validar só os campos de `TwilioInboundMessage` rejeitaria tráfego
 * genuíno. Ver `domain/signature.ts`.
 */

import type { TenantContext } from "@/db/client";
import type { Result } from "@/shared/result";
import { err, isErr, ok } from "@/shared/result";
import type { RawReceipt } from "@/modules/ingestion";
import { validateTwilioSignature } from "../domain/signature";
import { parseInbound } from "../domain/parser";
import type { ParsedInbound, TwilioInboundMessage } from "../domain/types";

export type HandleInboundError =
  | "invalid_signature"
  | "duplicate"
  | "parse_error"
  | "download_failed"
  | "enqueue_failed";

export interface HandleInboundDeps {
  getAuthToken(): string;
  // Recebe o `ParsedInbound` inteiro (não só messageSid) porque a
  // implementação real precisa de kind/body para gravar a linha de
  // dedupe em `inbound_messages` no mesmo INSERT atômico que reivindica
  // o messageSid — ver `infra/inbound-repository.ts`.
  checkDuplicate(inbound: ParsedInbound): Promise<boolean>;
  downloadMedia(url: string, authToken: string): Promise<Buffer>;
  enqueueReceipt(raw: RawReceipt): Promise<void>;
  sendReply(to: string, body: string): Promise<void>;
}

const TEXT_GUIDANCE_REPLY =
  "Para dar baixa no seu pagamento, envie a foto ou o PDF do comprovante.";
const MEDIA_RECEIVED_REPLY = "Recebemos seu comprovante e já estamos conferindo.";

/**
 * Ordem obrigatória (spec §9.2): assinatura → parse → dedupe por
 * `MessageSid` (C-04) → texto responde e encerra → mídia baixa
 * IMEDIATAMENTE (URL temporária expira) → enfileira → confirma.
 * `ctx` não é usado diretamente aqui — as dependências que tocam
 * banco/fila já chegam com o tenant amarrado por quem monta
 * `HandleInboundDeps` (CLAUDE.md invariante 3).
 *
 * `rawParams` é o body completo do webhook (todos os campos do form,
 * não só os de `TwilioInboundMessage`) — é sobre ele que a assinatura
 * é calculada, nunca sobre `payload`.
 */
export async function handleInbound(
  ctx: TenantContext,
  payload: TwilioInboundMessage,
  rawParams: Record<string, string>,
  signature: string,
  url: string,
  deps: HandleInboundDeps,
): Promise<Result<void, HandleInboundError>> {
  void ctx;

  const authToken = deps.getAuthToken();
  if (!validateTwilioSignature(authToken, signature, url, rawParams)) {
    return err("invalid_signature");
  }

  const parsed = parseInbound(payload);
  if (isErr(parsed)) return err("parse_error");
  const inbound = parsed.value;

  if (await deps.checkDuplicate(inbound)) return err("duplicate");

  if (inbound.kind === "text") {
    await deps.sendReply(inbound.from, TEXT_GUIDANCE_REPLY);
    return ok(undefined);
  }

  if (!inbound.mediaUrl) {
    // Não deveria acontecer — parseInbound garante mediaUrl quando kind === "media".
    return err("parse_error");
  }
  const mediaUrl = inbound.mediaUrl;

  let buffer: Buffer;
  try {
    buffer = await deps.downloadMedia(mediaUrl, authToken);
  } catch {
    return err("download_failed");
  }

  const raw: RawReceipt = {
    buffer,
    mimeType: inbound.mediaContentType ?? "application/octet-stream",
    sizeBytes: buffer.length,
    source: "whatsapp",
    receivedAt: new Date(),
    // Sem prefixo "whatsapp:" (parseInbound preserva o formato bruto do
    // Twilio) — identificação de pagador por telefone (spec §6.3)
    // compara contra `payers.phone_e164`, que nunca tem esse prefixo.
    fromPhone: inbound.from.replace(/^whatsapp:/, ""),
  };

  try {
    await deps.enqueueReceipt(raw);
  } catch {
    return err("enqueue_failed");
  }

  await deps.sendReply(inbound.from, MEDIA_RECEIVED_REPLY);
  return ok(undefined);
}
