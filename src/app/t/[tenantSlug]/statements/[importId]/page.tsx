import { notFound } from "next/navigation";
import Link from "next/link";
import { AlertCircle, CheckCircle2, UserCheck, type LucideIcon } from "lucide-react";
import { requireTenantSession } from "@/app/_lib/require-tenant-session";
import { getStatementImportById, getStatementLinesByImport } from "@/modules/statements";
import { Card } from "@/ui/components/Card";
import { Eyebrow } from "@/ui/components/Eyebrow";
import { InitialAvatar } from "@/ui/components/InitialAvatar";
import { Money } from "@/ui/components/Money";

const MATCH_LABEL: Record<string, string> = {
  auto_e2e: "Casada automaticamente (E2E)",
  manual: "Pagamento criado manualmente",
};

/**
 * Chip tintado por tipo de casamento (DESIGN.md v6 §2.6/§7.4) —
 * 3 categorias reais (`auto_e2e`/`manual`/sem match), cabem sem
 * agrupamento nos 3 tons do sistema. `chip-3` (âmbar) aqui é o uso
 * literal que o próprio DESIGN.md documenta para o token — "pendente
 * de ação" — porque "sem match" é exatamente isso.
 */
const MATCH_CHIP: Record<"auto_e2e" | "manual" | "unmatched", { bg: string; icon: LucideIcon }> = {
  auto_e2e: { bg: "bg-chip-1", icon: CheckCircle2 },
  manual: { bg: "bg-chip-2", icon: UserCheck },
  unmatched: { bg: "bg-chip-3", icon: AlertCircle },
};

function MatchChip({ matchKind }: { matchKind: string | null }) {
  const key = matchKind === "auto_e2e" || matchKind === "manual" ? matchKind : "unmatched";
  const { bg, icon: Icon } = MATCH_CHIP[key];
  const label = matchKind ? MATCH_LABEL[matchKind] ?? matchKind : "Sem match";
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`chip-icone ${bg}`} aria-hidden="true">
        <Icon className="size-3.5 text-content-primary" strokeWidth={1.75} />
      </span>
      <span className="text-content-secondary">{label}</span>
    </span>
  );
}

export default async function StatementImportDetailPage({
  params,
}: {
  params: Promise<{ tenantSlug: string; importId: string }>;
}) {
  const { tenantSlug, importId } = await params;
  const session = await requireTenantSession(tenantSlug);
  const ctx = { tenantId: session.tenantId };

  const statementImport = await getStatementImportById(ctx, importId);
  if (!statementImport) notFound();

  const lines = await getStatementLinesByImport(ctx, importId);

  // Resumo mínimo (DESIGN.md v6 §4.7) — reduce sobre a MESMA lista já
  // buscada, nenhuma query nova.
  const matchedCount = lines.filter((l) => l.matchKind !== null).length;

  return (
    <>
      <Eyebrow>Extrato — {statementImport.filename}</Eyebrow>

      {lines.length > 0 && (
        <div className="flex flex-wrap gap-6 rounded-card border-hairline border-line-hairline bg-surface-card p-4 shadow-card sm:p-card-pad">
          <div>
            <span className="font-mono text-micro tracking-micro text-content-secondary uppercase">
              Linhas
            </span>
            <p className="mt-1 font-num text-metric-sm text-content-primary tabular-nums">{lines.length}</p>
          </div>
          <div>
            <span className="font-mono text-micro tracking-micro text-content-secondary uppercase">
              Casadas
            </span>
            <p className="mt-1 font-num text-metric-sm text-content-primary tabular-nums">{matchedCount}</p>
          </div>
          <div>
            <span className="font-mono text-micro tracking-micro text-content-secondary uppercase">
              Sem match
            </span>
            <p className="mt-1 font-num text-metric-sm text-content-primary tabular-nums">
              {lines.length - matchedCount}
            </p>
          </div>
        </div>
      )}

      <Card>
        {lines.length === 0 ? (
          <p className="text-body text-content-muted">Nenhuma linha de crédito neste extrato.</p>
        ) : (
          <table className="w-full text-left text-body">
            <thead>
              <tr className="border-b border-line-hairline text-content-secondary">
                <th className="pb-2 font-medium">Data</th>
                <th className="pb-2 font-medium">Descrição</th>
                <th className="pb-2 font-medium">Contraparte</th>
                <th className="pb-2 font-medium">Valor</th>
                <th className="pb-2 font-medium">Status</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.id} className="border-b border-line-hairline">
                  <td className="py-2 text-content-secondary">{line.occurredAt.toISOString().slice(0, 10)}</td>
                  <td className="py-2 text-content-secondary">{line.description}</td>
                  <td className="py-2">
                    {/* Contraparte (DESIGN.md v6 §7.8) — só existe pra linha já casada; sem match, sem contraparte conhecida, é exatamente por isso que está sem match. */}
                    {line.payerName ? (
                      <span className="flex items-center gap-2">
                        <InitialAvatar name={line.payerName} />
                        {line.payerName}
                      </span>
                    ) : (
                      <span className="text-content-muted">—</span>
                    )}
                  </td>
                  <td className="py-2 font-num tabular-nums">
                    <Money value={line.amountCents} />
                  </td>
                  <td className="py-2">
                    <MatchChip matchKind={line.matchKind} />
                  </td>
                  <td className="py-2">
                    {!line.matchKind && (
                      <Link
                        href={`/t/${tenantSlug}/statements/${importId}/lines/${line.id}`}
                        className="text-accent hover:underline"
                      >
                        Criar pagamento
                      </Link>
                    )}
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
