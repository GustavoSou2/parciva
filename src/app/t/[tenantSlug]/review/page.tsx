import Link from "next/link";
import { requireTenantSession } from "@/app/_lib/require-tenant-session";
import { listProposalsByDecision } from "@/modules/reconciliation";
import { getReceiptWithExtraction } from "@/modules/ingestion";
import { Card } from "@/ui/components/Card";
import { Eyebrow } from "@/ui/components/Eyebrow";
import { Money } from "@/ui/components/Money";
import { StatusChip } from "@/ui/components/StatusChip";

/**
 * Fila de revisão (Marco 5, spec §6.6/§14 Fase 2) — todo comprovante que
 * o motor não conseguiu auto-aplicar (`reconciliation_proposals.decision
 * === "needs_review"`). Sem isso, a única forma de ver o que caiu em
 * revisão era consultar o banco direto — a peça que fecha o loop do
 * invariante 5 do CLAUDE.md ("na dúvida, revisão humana").
 */
export default async function ReviewQueuePage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const session = await requireTenantSession(tenantSlug);
  const ctx = { tenantId: session.tenantId };

  const proposals = await listProposalsByDecision(ctx, "needs_review");
  const rows = await Promise.all(
    proposals.map(async (proposal) => ({
      proposal,
      receipt: await getReceiptWithExtraction(ctx, proposal.receiptId),
    })),
  );

  return (
    <>
      <Eyebrow>Fila de revisão</Eyebrow>
      <Card>
        {rows.length === 0 ? (
          <p className="text-body text-content-muted">Nada em revisão no momento.</p>
        ) : (
          <table className="w-full text-left text-body">
            <thead>
              <tr className="border-b border-line-hairline text-content-secondary">
                <th className="pb-2 font-medium">Recebido em</th>
                <th className="pb-2 font-medium">Origem</th>
                <th className="pb-2 font-medium">Pagador (extraído)</th>
                <th className="pb-2 font-medium">Valor (extraído)</th>
                <th className="pb-2 font-medium">Confiança</th>
                <th className="pb-2 font-medium">Risco</th>
                <th className="pb-2 font-medium">Status</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ proposal, receipt }) => (
                <tr key={proposal.id} className="border-b border-line-hairline">
                  <td className="py-2 text-content-secondary">
                    {(receipt?.receivedAt ?? proposal.createdAt).toISOString().slice(0, 16).replace("T", " ")}
                  </td>
                  <td className="py-2 text-content-secondary">{receipt?.source ?? "—"}</td>
                  <td className="py-2 text-content-secondary">
                    {receipt?.extraction?.payer_name ?? "Não identificado"}
                  </td>
                  <td className="py-2 font-num tabular-nums">
                    {receipt?.extraction?.amount_cents != null ? (
                      <Money value={receipt.extraction.amount_cents} />
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="py-2 font-num text-content-secondary tabular-nums">
                    {(proposal.confidence * 100).toFixed(0)}%
                  </td>
                  <td className="py-2 font-num text-content-secondary tabular-nums">
                    {proposal.riskScore != null ? proposal.riskScore.toFixed(0) : "—"}
                  </td>
                  <td className="py-2">
                    <StatusChip status="review" />
                  </td>
                  <td className="py-2">
                    <Link
                      href={`/t/${tenantSlug}/review/${proposal.id}`}
                      className="text-content-primary hover:underline"
                    >
                      Revisar
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
