import Link from "next/link";
import { ClipboardCheck } from "lucide-react";
import { requireTenantSession } from "@/app/_lib/require-tenant-session";
import { listProposalsByDecision } from "@/modules/reconciliation";
import { getReceiptWithExtraction } from "@/modules/ingestion";
import { Eyebrow } from "@/ui/components/Eyebrow";
import { Money } from "@/ui/components/Money";
import { StatusChip, getCardStateBg } from "@/ui/components/StatusChip";
import { buttonClassName } from "@/ui/components/button-class-name";

/**
 * Fila de revisão (Marco 5, spec §6.6/§14 Fase 2) — todo comprovante que
 * o motor não conseguiu auto-aplicar (`reconciliation_proposals.decision
 * === "needs_review"`). Sem isso, a única forma de ver o que caiu em
 * revisão era consultar o banco direto — a peça que fecha o loop do
 * invariante 5 do CLAUDE.md ("na dúvida, revisão humana").
 *
 * Cartão por proposta em vez de tabela (mesmo padrão de
 * `contracts/page.tsx`) — todo item aqui está em "análise" por
 * definição da própria fila, então o pastel é uniforme de propósito: é
 * o sinal de "isso tudo precisa da sua atenção agora", não uma
 * comparação entre estados diferentes.
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

      {rows.length === 0 ? (
        <p className="rounded-card border-hairline border-line-hairline bg-surface-card p-card-pad text-body text-content-muted shadow-card">
          Nada em revisão no momento.
        </p>
      ) : (
        <ul className="flex flex-col gap-card-gap">
          {rows.map(({ proposal, receipt }) => (
            <li
              key={proposal.id}
              className={`rounded-card border-hairline border-line-hairline p-card-pad shadow-card transition-colors duration-150 hover:border-line-strong ${getCardStateBg("review")}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <ClipboardCheck className="mt-0.5 size-4 shrink-0 text-content-secondary" strokeWidth={1.75} />
                  <div>
                    <p className="text-body font-medium text-content-primary">
                      {receipt?.extraction?.payer_name ?? "Pagador não identificado"}
                    </p>
                    <p className="font-mono text-aux text-content-muted">
                      {(receipt?.receivedAt ?? proposal.createdAt).toISOString().slice(0, 16).replace("T", " ")} ·{" "}
                      {receipt?.source ?? "—"}
                    </p>
                    <p className="mt-1 font-mono text-aux text-content-secondary">
                      Confiança {(proposal.confidence * 100).toFixed(0)}%
                      {proposal.riskScore != null && ` · Risco ${proposal.riskScore.toFixed(0)}`}
                    </p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className="font-num text-metric text-content-primary tabular-nums">
                    {receipt?.extraction?.amount_cents != null ? (
                      <Money value={receipt.extraction.amount_cents} />
                    ) : (
                      "—"
                    )}
                  </span>
                  <StatusChip status="review" />
                </div>
              </div>
              <Link
                href={`/t/${tenantSlug}/review/${proposal.id}`}
                className={`${buttonClassName("secondary")} mt-3 inline-block`}
              >
                Revisar
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
