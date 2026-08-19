/**
 * Cliente REST da Resend — sem SDK, `fetch` cru (mesmo padrão de
 * `billing/infra/abacatepay-client.ts`/webhook do Twilio). Único
 * endpoint usado: `POST /emails`. Usado por `identity` (convite, reset
 * de senha) e `tenant` (boas-vindas) — fica em `shared/` por isso, mesmo
 * raciocínio de `logger.ts`/`rate-limit.ts` (utilitário de
 * infraestrutura cross-módulo, não regra de domínio de um módulo só).
 *
 * Sem conta Resend criada ainda nesta tarefa — implementado contra a
 * API pública documentada (estável: Bearer token, corpo
 * `{from, to, subject, html}`), sem verificação ao vivo. Pendência
 * registrada em DECISIONS.md/PROGRESS.md, mesmo status do segredo do
 * webhook da AbacatePay antes de existir (DECISIONS.md [25]).
 *
 * Quem chama trata como best-effort (`try/catch`, nunca desfaz nada) —
 * por isso esta função lança em vez de engolir erro: quem decide "não
 * derrubar o fluxo por falha de e-mail" é o chamador, não este cliente.
 */

import { logger } from "./logger";

const RESEND_API_URL = "https://api.resend.com/emails";

/** Endereço sandbox da própria Resend — funciona sem domínio verificado, só pra dev/teste. */
const DEV_FROM_ADDRESS = "Parciva <onboarding@resend.dev>";

function apiKey(): string {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    throw new Error("RESEND_API_KEY não configurada.");
  }
  return key;
}

function fromAddress(): string {
  return process.env.EMAIL_FROM_ADDRESS ?? DEV_FROM_ADDRESS;
}

export interface SendEmailInput {
  readonly to: string;
  readonly subject: string;
  readonly html: string;
}

export async function sendEmail(input: SendEmailInput): Promise<void> {
  const response = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromAddress(),
      to: input.to,
      subject: input.subject,
      html: input.html,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    logger.error("Resend: envio de e-mail falhou", { status: response.status, body });
    throw new Error(`Resend falhou: ${response.status}`);
  }
}
