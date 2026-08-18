/**
 * Resolve o tenant dono de um número Twilio a partir de
 * `whatsapp_channels.phone_number_id` — spec §5.4. Usa `getRootDb()`
 * (não `getDb(ctx, ...)`) de propósito: este é exatamente o problema de
 * bootstrap que `getRootDb()` existe para resolver — não há `tenantId`
 * até esta consulta responder (ver comentário em `src/db/client.ts` e em
 * `src/db/schema/ingestion.ts` sobre `whatsapp_channels` ficar fora da
 * RLS).
 */

import { eq } from "drizzle-orm";
import { getRootDb } from "@/db/client";
import { whatsappChannels } from "@/db/schema/ingestion";

export interface ResolvedChannel {
  readonly tenantId: string;
  readonly channelId: string;
}

export async function resolveTenantByPhoneNumberId(
  phoneNumberId: string,
): Promise<ResolvedChannel | null> {
  const rows = await getRootDb()
    .select({ tenantId: whatsappChannels.tenantId, channelId: whatsappChannels.id })
    .from(whatsappChannels)
    .where(eq(whatsappChannels.phoneNumberId, phoneNumberId))
    .limit(1);

  return rows[0] ?? null;
}
