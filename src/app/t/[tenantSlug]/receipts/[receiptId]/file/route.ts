/**
 * Serve o binário original do comprovante para a fila de revisão (Marco
 * 5, spec §5.3) — sem isso não há como mostrar "comprovante × proposta
 * lado a lado" (spec §7.1 Tier 5). `requireTenantSession` garante que só
 * quem tem sessão NESTE tenant lê o arquivo; `getReceiptWithExtraction`
 * já filtra por `tenant_id` (invariante 3) antes de expor `storageKey`.
 *
 * Em produção isto deveria delegar a `X-Accel-Redirect` (decisão [7]) —
 * não há Nginx em dev; ler e devolver o buffer aqui é a dívida
 * documentada, não escondida.
 */

import { NextResponse } from "next/server";
import { requireTenantSession } from "@/app/_lib/require-tenant-session";
import { getReceiptWithExtraction } from "@/modules/ingestion";
import { readReceiptFile } from "@/shared/storage";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ tenantSlug: string; receiptId: string }> },
): Promise<Response> {
  const { tenantSlug, receiptId } = await params;
  const session = await requireTenantSession(tenantSlug);
  const ctx = { tenantId: session.tenantId };

  const receipt = await getReceiptWithExtraction(ctx, receiptId);
  if (!receipt) {
    return NextResponse.json({ error: "receipt_not_found" }, { status: 404 });
  }

  const buffer = await readReceiptFile(receipt.storageKey);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": receipt.mimeType,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
