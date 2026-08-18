/**
 * Endpoint HTTP do webhook da AbacatePay (spec §14 Fase 4). Ao
 * contrário de `api/webhooks/whatsapp/route.ts` — que devolve 200
 * SEMPRE porque o Twilio reenvia sem ajudar em nenhum caso de erro
 * tratado lá —, este endpoint devolve status HTTP FIEL ao resultado:
 * a documentação da AbacatePay reenvia o webhook em backoff se a
 * resposta não for 2xx, e aqui isso é desejável (assinatura corrompida
 * em trânsito, erro transitório de banco). Não copiar o padrão
 * "sempre 200" daqui pra lá nem de lá pra aqui.
 *
 * Assinatura: header `X-Webhook-Signature`, HMAC-SHA256 em base64 do
 * corpo cru, chave = segredo configurado ao criar o webhook no painel
 * da AbacatePay (`ABACATE_PAY_WEBHOOK_SECRET`, distinto da API key).
 * Confirmado contra a documentação pública em 2026-08-18 — o payload
 * detalhado de `data` por tipo de evento não é documentado, então o
 * formato usado aqui (`id`, `status`, `metadata`) é o subconjunto
 * mínimo necessário pra `handleBillingWebhook`, ainda sem teste
 * round-trip real (depende da configuração manual do webhook no
 * painel — ver plano da Fase 4).
 */

import { NextResponse, type NextRequest } from "next/server";
import { isErr } from "@/shared/result";
import { logger } from "@/shared/logger";
import {
  getPlanByCode,
  handleBillingWebhook,
  upsertSubscription,
  validateAbacatePaySignature,
  type AbacatePayWebhookEvent,
} from "@/modules/billing";
import { getTenantStatus, setTenantStatus } from "@/modules/tenant";

export const runtime = "nodejs";

function getWebhookSecret(): string {
  const secret = process.env.ABACATE_PAY_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("ABACATE_PAY_WEBHOOK_SECRET não configurado.");
  }
  return secret;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch (error) {
    logger.error("webhook AbacatePay: falha ao ler corpo da requisição", { error });
    return NextResponse.json({ error: "invalid_body" }, { status: 500 });
  }

  const signature = request.headers.get("X-Webhook-Signature") ?? "";
  let secret: string;
  try {
    secret = getWebhookSecret();
  } catch (error) {
    logger.error("webhook AbacatePay: segredo não configurado", { error });
    return NextResponse.json({ error: "webhook_not_configured" }, { status: 500 });
  }

  if (!validateAbacatePaySignature(secret, signature, rawBody)) {
    logger.warn("webhook AbacatePay: assinatura inválida");
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  let event: AbacatePayWebhookEvent;
  try {
    event = JSON.parse(rawBody) as AbacatePayWebhookEvent;
  } catch (error) {
    logger.error("webhook AbacatePay: corpo não é JSON válido", { error });
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  try {
    const result = await handleBillingWebhook(event, {
      getTenantStatus,
      setTenantStatus,
      getPlanByCode,
      upsertSubscription,
    });

    if (isErr(result)) {
      logger.error("webhook AbacatePay: processamento falhou", {
        event: event.event,
        outcome: result.error,
      });
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    logger.debug("webhook AbacatePay: processado", { event: event.event, outcome: result.value });
    return NextResponse.json({ received: true, outcome: result.value }, { status: 200 });
  } catch (error) {
    logger.error("webhook AbacatePay: erro inesperado", { error, event: event.event });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
