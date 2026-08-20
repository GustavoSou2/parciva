import Link from "next/link";
import { Medal } from "lucide-react";
import { requireTenantSession } from "@/app/_lib/require-tenant-session";
import { listPayers, listPayerDelinquencyStats, computeDelinquencyBadge } from "@/modules/payers";
import { requirePermission } from "@/modules/identity";
import { isErr } from "@/shared/result";
import { Eyebrow } from "@/ui/components/Eyebrow";
import { InitialAvatar } from "@/ui/components/InitialAvatar";
import { RowMenu } from "@/ui/components/RowMenu";
import { PayerStatusChip } from "@/ui/components/StatusChip";
import { buttonClassName } from "@/ui/components/button-class-name";

const RANKING_ICON_CLASS: Record<number, string> = {
  0: "ranking-icone-1",
  1: "ranking-icone-2",
  2: "ranking-icone-3",
};

/**
 * Cartão por pagador em vez de tabela.
 *
 * Fundo do card voltou a ser neutro (DESIGN.md v6 §7.8, revisão de
 * §2.5, Rodada 6) — só a pílula carrega o estado agora, mesmo motivo
 * de `contracts/page.tsx`.
 *
 * Densidade mínima por linha (§7.8): avatar/inicial (contraparte),
 * documento+telefone (identificador), **"cliente desde"** (`payer.
 * createdAt` — coluna que já existia no schema, nunca mapeada pro
 * domínio até esta rodada), **selo de risco** (§7.9, "atrasou X de Y",
 * estatística real via `listPayerDelinquencyStats`), estado (pílula) e
 * ação rápida (`RowMenu`).
 *
 * Rail direita (§4.7.2): ranking dos pagadores com mais parcela vencida
 * — reaproveita a MESMA consulta agregada do selo de risco (uma query
 * pro tenant inteiro, não uma por pagador).
 */
export default async function PayersPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const session = await requireTenantSession(tenantSlug);
  const canWrite = !isErr(requirePermission(session.role, "contracts:write"));
  const ctx = { tenantId: session.tenantId };
  const [payers, delinquencyStats] = await Promise.all([listPayers(ctx), listPayerDelinquencyStats(ctx)]);

  const statsByPayer = new Map(delinquencyStats.map((s) => [s.payerId, s]));
  const activePayers = payers.filter((p) => p.status !== "inactive");

  const payerNameById = new Map(payers.map((p) => [p.id, p.name]));
  const ranking = delinquencyStats
    .filter((s) => s.overdueInstallments > 0)
    .sort((a, b) => b.overdueInstallments - a.overdueInstallments)
    .slice(0, 5);

  return (
    <>
      <div className="flex items-center justify-between">
        <Eyebrow>Pagadores</Eyebrow>
        {canWrite && (
          <Link href={`/t/${tenantSlug}/payers/new`} className={buttonClassName("secondary")}>
            Novo pagador
          </Link>
        )}
      </div>

      {payers.length > 0 && (
        <div className="flex flex-wrap gap-6 rounded-card border-hairline border-line-hairline bg-surface-card p-4 shadow-card sm:p-card-pad">
          <div>
            <span className="font-mono text-micro tracking-micro text-content-secondary uppercase">Total</span>
            <p className="mt-1 font-num text-metric-sm text-content-primary tabular-nums">{payers.length}</p>
          </div>
          <div>
            <span className="font-mono text-micro tracking-micro text-content-secondary uppercase">Ativos</span>
            <p className="mt-1 font-num text-metric-sm text-content-primary tabular-nums">
              {activePayers.length}
            </p>
          </div>
          <div>
            <span className="font-mono text-micro tracking-micro text-content-secondary uppercase">
              Inativos
            </span>
            <p className="mt-1 font-num text-metric-sm text-content-primary tabular-nums">
              {payers.length - activePayers.length}
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-card-gap lg:flex-row">
        <div className="flex-1">
          {payers.length === 0 ? (
            <p className="rounded-card border-hairline border-line-hairline bg-surface-card p-card-pad text-body text-content-muted shadow-card">
              Nenhum pagador cadastrado ainda. Assim que criar um, ele aparece aqui.
            </p>
          ) : (
            <ul className="flex flex-col gap-card-gap">
              {payers.map((payer) => {
                const statusKey = payer.status === "inactive" ? "inactive" : "active";
                const stats = statsByPayer.get(payer.id);
                const badge = stats ? computeDelinquencyBadge(stats) : null;
                return (
                  <li
                    key={payer.id}
                    className="flex items-center justify-between gap-4 rounded-card border-hairline border-line-hairline bg-surface-card p-card-pad shadow-card transition-colors duration-150 hover:border-line-strong"
                  >
                    <Link href={`/t/${tenantSlug}/payers/${payer.id}`} className="flex flex-1 items-center gap-3">
                      <InitialAvatar name={payer.name} />
                      <div className="flex flex-1 items-center justify-between gap-4">
                        <div>
                          <p className="text-body font-medium text-content-primary">{payer.name}</p>
                          <p className="font-mono text-aux text-content-muted">
                            cliente desde {payer.createdAt.toISOString().slice(0, 10)}
                          </p>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="flex gap-6 font-mono text-aux text-content-muted">
                            <span>{payer.documentMasked ?? "—"}</span>
                            <span>{payer.phoneE164 ?? "—"}</span>
                          </div>
                          {badge && (
                            <span className={badge.hasRisk ? "selo-tendencia-baixa" : "selo-tendencia-alta"}>
                              {badge.label}
                            </span>
                          )}
                          <PayerStatusChip status={statusKey} />
                        </div>
                      </div>
                    </Link>
                    <RowMenu actions={[{ label: "Editar", href: `/t/${tenantSlug}/payers/${payer.id}/edit` }]} />
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Rail direita (DESIGN.md v6 §4.7.2) — ranking real de atraso, DESIGN.md §2.8/§7.6 (primeira lista ordenada por valor que qualifica pra medalha). */}
        {ranking.length > 0 && (
          <aside className="flex w-full flex-col gap-2 lg:w-rail lg:shrink-0">
            <Eyebrow>Mais atraso histórico</Eyebrow>
            <div className="cartao-rail flex flex-col gap-3">
              {ranking.map((stat, i) => (
                <div key={stat.payerId} className="flex items-center gap-3">
                  {i < 3 ? (
                    <Medal className={`size-4 shrink-0 ${RANKING_ICON_CLASS[i]}`} strokeWidth={1.75} />
                  ) : (
                    <span className="w-4 shrink-0 text-center font-mono text-aux text-content-secondary">
                      {i + 1}
                    </span>
                  )}
                  <div className="flex-1 overflow-hidden">
                    <p className="truncate text-body text-content-primary">
                      {payerNameById.get(stat.payerId) ?? "—"}
                    </p>
                  </div>
                  <span className="selo-tendencia-baixa font-mono text-aux">
                    {stat.overdueInstallments}/{stat.dueInstallments}
                  </span>
                </div>
              ))}
            </div>
          </aside>
        )}
      </div>
    </>
  );
}
