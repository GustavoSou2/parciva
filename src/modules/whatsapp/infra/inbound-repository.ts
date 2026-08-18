/**
 * Dedupe real do webhook (spec §9.2, C-04) — chave é
 * `inbound_messages.provider_message_id` (o `MessageSid` do Twilio),
 * único por tenant. Diferente do dedupe de `receipts` (soft, protegido
 * pela concorrência 1 do worker), aqui a concorrência é real: retries do
 * Twilio chegam como requisições HTTP concorrentes no endpoint Next.js,
 * não seriadas por nada — por isso `claimInboundMessage` é um
 * `INSERT ... ON CONFLICT DO NOTHING` atômico, não um SELECT seguido de
 * INSERT.
 */

import { getDb, type TenantContext } from "@/db/client";
import { inboundMessages } from "@/db/schema/ingestion";
import type { InboundKind } from "../domain/types";

export interface ClaimInboundMessageInput {
  readonly channelId: string;
  readonly messageSid: string;
  readonly kind: InboundKind;
  readonly body?: string;
}

/** `true` se esta chamada "ganhou" a claim (mensagem nova); `false` se já existia (duplicata). */
export async function claimInboundMessage(
  ctx: TenantContext,
  input: ClaimInboundMessageInput,
): Promise<boolean> {
  const rows = await getDb(ctx, (db) =>
    db
      .insert(inboundMessages)
      .values({
        tenantId: ctx.tenantId,
        channelId: input.channelId,
        providerMessageId: input.messageSid,
        kind: input.kind,
        body: input.body ?? null,
      })
      .onConflictDoNothing({
        target: [inboundMessages.tenantId, inboundMessages.providerMessageId],
      })
      .returning({ id: inboundMessages.id }),
  );

  return rows.length > 0;
}
