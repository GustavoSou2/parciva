/**
 * Endpoint HTTP do webhook do Twilio (canal WhatsApp) — spec §9.2.
 * Responsabilidade única deste arquivo: montar as dependências de I/O e
 * repassar para `handleInbound` (módulo `whatsapp`); nenhuma regra de
 * negócio mora aqui.
 *
 * Responde 200 SEMPRE, mesmo em erro — Twilio reenvia a mensagem se não
 * receber 200 em até 5s (spec §9.2), e reenvio não ajuda em nenhum dos
 * casos de erro tratados aqui (assinatura inválida nunca vai validar
 * numa segunda tentativa; falha de fila/download já foi logada). A
 * validação de assinatura já aconteceu antes de qualquer ação com
 * efeito, então devolver 200 para tráfego forjado não abre brecha nova.
 */

import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import type { TenantContext } from "@/db/client";
import { isErr } from "@/shared/result";
import { logger } from "@/shared/logger";
import type { RawReceipt } from "@/modules/ingestion";
import {
  claimInboundMessage,
  handleInbound,
  resolveTenantByPhoneNumberId,
  type HandleInboundDeps,
} from "@/modules/whatsapp";
import { getReceiptQueue } from "@/workers/queues";
import { REPLY_DUPLICATE } from "./replies";

export const runtime = "nodejs";

function getAuthToken(): string {
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token) {
    throw new Error("TWILIO_AUTH_TOKEN não configurado.");
  }
  return token;
}

function checkDuplicate(
  ctx: TenantContext,
  channelId: string,
): (inbound: Parameters<HandleInboundDeps["checkDuplicate"]>[0]) => Promise<boolean> {
  return async (inbound) => {
    const claimed = await claimInboundMessage(ctx, {
      channelId,
      messageSid: inbound.messageSid,
      kind: inbound.kind,
      ...(inbound.body !== undefined ? { body: inbound.body } : {}),
    });
    return !claimed;
  };
}

// C-43: mídia baixada imediatamente — a URL do Twilio é temporária e expira.
async function downloadMedia(url: string, authToken: string): Promise<Buffer> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  if (!accountSid) {
    throw new Error("TWILIO_ACCOUNT_SID não configurado.");
  }

  const credentials = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  const response = await fetch(url, {
    headers: { Authorization: `Basic ${credentials}` },
  });
  if (!response.ok) {
    throw new Error(`Download de mídia falhou com status ${response.status}.`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function enqueueReceipt(tenantId: string, raw: RawReceipt): Promise<void> {
  const receiptId = randomUUID();
  logger.debug("enqueueReceipt chamado", { tenantId, receiptId, mimeType: raw.mimeType });
  await getReceiptQueue().add("process-receipt", {
    tenantId,
    receiptId,
    buffer: raw.buffer.toString("base64"),
    mimeType: raw.mimeType,
    source: raw.source,
    receivedAt: raw.receivedAt.toISOString(),
    ...(raw.fromPhone ? { fromPhone: raw.fromPhone } : {}),
  });
  logger.debug("enqueueReceipt: job adicionado com sucesso", { receiptId });
}

async function sendReply(to: string, body: string): Promise<void> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  // TODO: número de origem hoje é global (`TWILIO_WHATSAPP_FROM`); quando
  // o banco estiver conectado, resolver por `whatsapp_channels.display_number`
  // do tenant do contexto (mesma limitação de `checkDuplicate` acima).
  const from = process.env.TWILIO_WHATSAPP_FROM;
  if (!accountSid || !authToken || !from) {
    throw new Error("Credenciais do Twilio ausentes para enviar resposta.");
  }

  const credentials = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  const formBody = new URLSearchParams({ To: to, From: from, Body: body });

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formBody.toString(),
    },
  );
  if (!response.ok) {
    throw new Error(`Envio de resposta pelo Twilio falhou com status ${response.status}.`);
  }
}

/**
 * A URL usada na validação da assinatura precisa ser a que o Twilio
 * efetivamente chamou. Atrás do proxy reverso da VPS (spec §3.1),
 * `request.url` reflete o host interno — por isso prioriza os cabeçalhos
 * `X-Forwarded-*` que o Nginx/Caddy repassa.
 */
function resolveRequestUrl(request: NextRequest): string {
  const proto = request.headers.get("x-forwarded-proto");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (proto && host) {
    return `${proto}://${host}${request.nextUrl.pathname}${request.nextUrl.search}`;
  }
  return request.url;
}

// Sem type annotation nominal aqui de propósito: `TwilioInboundMessage`
// não é exportado pelo `index.ts` do módulo (CLAUDE.md — nunca importar
// `domain/**` de fora do módulo). TypeScript checa a compatibilidade
// estruturalmente no site de chamada de `handleInbound`.
function buildPayload(rawParams: Record<string, string>) {
  return {
    From: rawParams.From ?? "",
    To: rawParams.To ?? "",
    MessageSid: rawParams.MessageSid ?? "",
    ...(rawParams.Body !== undefined ? { Body: rawParams.Body } : {}),
    ...(rawParams.NumMedia !== undefined ? { NumMedia: rawParams.NumMedia } : {}),
    ...(rawParams.MediaUrl0 !== undefined ? { MediaUrl0: rawParams.MediaUrl0 } : {}),
    ...(rawParams.MediaContentType0 !== undefined
      ? { MediaContentType0: rawParams.MediaContentType0 }
      : {}),
  };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const rawBody = await request.text();
    // ATENÇÃO: params é o body COMPLETO do form (todos os campos que o
    // Twilio manda — AccountSid, ApiVersion, WaId, etc.), não só os de
    // `TwilioInboundMessage` — é sobre ele que a assinatura é calculada.
    const rawParams: Record<string, string> = {};
    for (const [key, value] of new URLSearchParams(rawBody).entries()) {
      rawParams[key] = value;
    }

    const signature = request.headers.get("X-Twilio-Signature") ?? "";
    const url = resolveRequestUrl(request);
    const payload = buildPayload(rawParams);

    // Resolve o tenant a partir de `payload.To` em
    // `whatsapp_channels.phone_number_id`. Precisa acontecer antes de
    // `handleInbound` porque `ctx`/`deps` (que carregam o tenantId) são
    // montados aqui — a validação de assinatura continua sendo o
    // primeiro passo REAL de `handleInbound` (spec §9.2); resolver o
    // canal antes não pula essa checagem, só decide qual tenant validar
    // contra. Canal desconhecido e assinatura inválida devolvem a mesma
    // resposta 200 opaca, sem distinguir os dois casos para quem chamou.
    const channel = await resolveTenantByPhoneNumberId(payload.To);
    if (!channel) {
      logger.error("canal desconhecido para o número", { to: payload.To });
      return NextResponse.json({ received: true }, { status: 200 });
    }

    const ctx: TenantContext = { tenantId: channel.tenantId };

    const deps: HandleInboundDeps = {
      getAuthToken,
      checkDuplicate: checkDuplicate(ctx, channel.channelId),
      downloadMedia,
      enqueueReceipt: (raw) => enqueueReceipt(ctx.tenantId, raw),
      sendReply,
    };

    logger.debug("handleInbound: chamando");
    const result = await handleInbound(ctx, payload, rawParams, signature, url, deps);
    logger.debug("handleInbound resultado", { result });

    if (isErr(result) && result.error === "duplicate" && payload.From) {
      try {
        await sendReply(payload.From, REPLY_DUPLICATE);
      } catch (error) {
        logger.error("falha ao enviar aviso de duplicidade", { error });
      }
    }

    if (isErr(result)) {
      logger.error("handleInbound retornou erro", { error: result.error });
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    logger.error("erro inesperado no webhook do WhatsApp", { error });
    return NextResponse.json({ received: true }, { status: 200 });
  }
}
