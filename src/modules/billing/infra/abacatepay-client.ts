/**
 * Cliente REST da AbacatePay (v2) — sem SDK, `fetch` cru (mesmo padrão
 * de `ingestion/infra/anthropic-vlm.ts` e do webhook do Twilio). Base
 * URL, formato de envelope (`{success, data, error}`) e os 3 endpoints
 * usados aqui foram confirmados empiricamente contra
 * `ABACATE_PAY_DEV_API_KEY` antes de escrever este arquivo — a
 * documentação pública mistura nomes de uma API v1 antiga
 * (`/v1/billing/create`, `/v1/customer/create`) que devolvem "API key
 * version mismatch" com esta chave. Os nomes reais confirmados: `/v2/
 * products/create`, `/v2/customers/create`, `/v2/checkouts/create`.
 *
 * `frequency: "SUBSCRIPTION"` em `checkouts/create` foi testado e
 * **ignorado silenciosamente** pela API (resposta sempre volta
 * `frequency: "ONE_TIME"`) — não existe cobrança recorrente automática
 * pela AbacatePay neste plano de produto. Por isso a "assinatura" é
 * inteiramente responsabilidade do Parciva: gerar uma cobrança PIX
 * nova a cada ciclo (`billing/application/subscribe-tenant.ts`), nunca
 * delegar a recorrência pra AbacatePay.
 *
 * Nunca logar `ABACATE_PAY_API_KEY`/`ABACATE_PAY_DEV_API_KEY` nem o
 * corpo de resposta com dado de cliente (nome/CPF/e-mail) — só
 * ids/status.
 */

import { logger } from "@/shared/logger";

const ABACATEPAY_API_URL = "https://api.abacatepay.com/v2";

interface AbacatePayEnvelope<T> {
  readonly success: boolean;
  readonly data: T | null;
  readonly error: string | null;
}

function apiKey(): string {
  const key =
    process.env.NODE_ENV === "production"
      ? process.env.ABACATE_PAY_API_KEY
      : process.env.ABACATE_PAY_DEV_API_KEY ?? process.env.ABACATE_PAY_API_KEY;
  if (!key) {
    throw new Error("Chave de API da AbacatePay não configurada (ABACATE_PAY_API_KEY/ABACATE_PAY_DEV_API_KEY).");
  }
  return key;
}

async function post<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${ABACATEPAY_API_URL}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const envelope = (await response.json()) as AbacatePayEnvelope<T>;
  if (!response.ok || !envelope.success || envelope.data === null) {
    logger.error("AbacatePay: requisição falhou", { path, status: response.status, error: envelope.error });
    throw new Error(`AbacatePay ${path} falhou: ${envelope.error ?? response.status}`);
  }
  return envelope.data;
}

export interface AbacatePayProduct {
  readonly id: string;
}

/** Um produto por plano cobrado (essential/professional) — reaproveitado em toda cobrança daquele plano, nunca recriado. */
export async function createProduct(input: {
  externalId: string;
  name: string;
  priceCents: number;
}): Promise<AbacatePayProduct> {
  return post<AbacatePayProduct>("/products/create", {
    externalId: input.externalId,
    name: input.name,
    price: input.priceCents,
    currency: "BRL",
  });
}

export interface AbacatePayCustomer {
  readonly id: string;
}

/**
 * `taxId` precisa ser um CPF/CNPJ com dígito verificador válido — a
 * AbacatePay valida o checksum, não só o formato (achado ao testar
 * com um CPF de formato válido mas DV inventado: "Invalid taxId").
 */
export async function createCustomer(input: {
  name: string;
  email: string;
  cellphone: string;
  taxId: string;
}): Promise<AbacatePayCustomer> {
  return post<AbacatePayCustomer>("/customers/create", input);
}

export interface AbacatePayCheckout {
  readonly id: string;
  readonly url: string;
  readonly amount: number;
  readonly status: string;
}

export async function createCheckout(input: {
  productId: string;
  customerId: string;
  returnUrl: string;
  completionUrl: string;
  metadata?: Record<string, unknown>;
}): Promise<AbacatePayCheckout> {
  return post<AbacatePayCheckout>("/checkouts/create", {
    items: [{ id: input.productId, quantity: 1 }],
    methods: ["PIX"],
    customerId: input.customerId,
    returnUrl: input.returnUrl,
    completionUrl: input.completionUrl,
    ...(input.metadata ? { metadata: input.metadata } : {}),
  });
}
