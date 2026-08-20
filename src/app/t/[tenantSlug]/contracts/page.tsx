import Link from "next/link";
import { CalendarClock, FileText } from "lucide-react";
import { requireTenantSession } from "@/app/_lib/require-tenant-session";
import { listContracts, listContractRiskInfo, type ContractRiskInfo } from "@/modules/contracts";
import { requirePermission } from "@/modules/identity";
import { isErr } from "@/shared/result";
import { sum } from "@/shared/money";
import { Eyebrow } from "@/ui/components/Eyebrow";
import { InitialAvatar } from "@/ui/components/InitialAvatar";
import { Money } from "@/ui/components/Money";
import { RowMenu } from "@/ui/components/RowMenu";
import { ContractStatusChip } from "@/ui/components/StatusChip";
import { buttonClassName } from "@/ui/components/button-class-name";

const UPCOMING_RAIL_WINDOW_DAYS = 7;

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDaysISO(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Lista de contratos — cartão por contrato em vez de tabela crua.
 *
 * Fundo do card voltou a ser neutro (DESIGN.md v6 §7.8, revisão de
 * §2.5, Rodada 6): fundo sólido por linha, quando a maioria dos
 * contratos compartilha o mesmo estado (`ativo`), virava um bloco de
 * cor uniforme sem sinalizar nada — só a pílula (`ContractStatusChip`)
 * continua carregando o estado.
 *
 * Densidade mínima por linha (§7.8) — 5 campos reais, nenhum inventado:
 * avatar/inicial do pagador (contraparte), descrição+parcelas
 * (identificador), valor, **próximo vencimento** (`listContractRiskInfo`
 * — dado que já existia em `installments`, só nunca tinha sido puxado
 * pra esta tela), estado (pílula) e ação rápida (`RowMenu`, reaproveita
 * a rota de edição que já existe).
 *
 * Resumo mínimo (DESIGN.md v6 §4.7) — reduce sobre a MESMA lista já
 * buscada; rail direita (§4.7.2) — "vencendo em 7 dias" + "taxa em dia",
 * derivados de `listContractRiskInfo` (uma query agregada, tenant
 * inteiro, não uma por contrato).
 */
export default async function ContractsPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const session = await requireTenantSession(tenantSlug);
  const canWrite = !isErr(requirePermission(session.role, "contracts:write"));
  const ctx = { tenantId: session.tenantId };
  const [contracts, riskInfo] = await Promise.all([listContracts(ctx), listContractRiskInfo(ctx)]);

  const riskByContract = new Map<string, ContractRiskInfo>(riskInfo.map((r) => [r.contractId, r]));

  const activeContracts = contracts.filter((c) => c.status !== "cancelled");
  const activePrincipalTotal = sum(activeContracts.map((c) => c.principalCents));

  const today = todayISO();
  const windowEnd = addDaysISO(today, UPCOMING_RAIL_WINDOW_DAYS);
  const upcoming = contracts
    .filter((c) => c.status !== "cancelled")
    .map((c) => ({ contract: c, risk: riskByContract.get(c.id) }))
    .filter((r) => r.risk?.nextDueDate != null && r.risk.nextDueDate >= today && r.risk.nextDueDate <= windowEnd)
    .sort((a, b) => a.risk!.nextDueDate!.localeCompare(b.risk!.nextDueDate!));

  const activeWithRisk = activeContracts.map((c) => riskByContract.get(c.id));
  const onTimeCount = activeWithRisk.filter((r) => r && !r.hasOverdue).length;
  const onTimeRate = activeContracts.length > 0 ? Math.round((onTimeCount / activeContracts.length) * 100) : null;

  return (
    <>
      <div className="flex items-center justify-between">
        <Eyebrow>Contratos</Eyebrow>
        {canWrite && (
          <Link href={`/t/${tenantSlug}/contracts/new`} className={buttonClassName("secondary")}>
            Novo contrato
          </Link>
        )}
      </div>

      {contracts.length > 0 && (
        <div className="flex flex-wrap gap-6 rounded-card border-hairline border-line-hairline bg-surface-card p-4 shadow-card sm:p-card-pad">
          <div>
            <span className="font-mono text-micro tracking-micro text-content-secondary uppercase">Total</span>
            <p className="mt-1 font-num text-metric-sm text-content-primary tabular-nums">{contracts.length}</p>
          </div>
          <div>
            <span className="font-mono text-micro tracking-micro text-content-secondary uppercase">Ativos</span>
            <p className="mt-1 font-num text-metric-sm text-content-primary tabular-nums">{activeContracts.length}</p>
          </div>
          <div>
            <span className="font-mono text-micro tracking-micro text-content-secondary uppercase">
              Valor ativo
            </span>
            <p className="mt-1 font-num text-metric-sm text-content-primary tabular-nums">
              <Money value={activePrincipalTotal} />
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-card-gap lg:flex-row">
        <div className="flex-1">
          {contracts.length === 0 ? (
            <p className="rounded-card border-hairline border-line-hairline bg-surface-card p-card-pad text-body text-content-muted shadow-card">
              Nenhum contrato ainda. Assim que criar um, ele aparece aqui.
            </p>
          ) : (
            <ul className="flex flex-col gap-card-gap">
              {contracts.map((contract) => {
                // `contracts.status` (schema) é `text` livre, não enum — só
                // "active"/"cancelled" existem de fato hoje (ver StatusChip.tsx).
                const statusKey = contract.status as "active" | "cancelled";
                const risk = riskByContract.get(contract.id);
                return (
                  <li
                    key={contract.id}
                    className="flex items-start justify-between gap-4 rounded-card border-hairline border-line-hairline bg-surface-card p-card-pad shadow-card transition-colors duration-150 hover:border-line-strong"
                  >
                    {/* `<a>` não pode conter `<button>` (RowMenu) como descendente — o link cobre só o conteúdo principal, o menu fica fora, mesmo padrão de `Modal.tsx`/`Link` + `<button>` já usado no resto do produto. */}
                    <Link
                      href={`/t/${tenantSlug}/contracts/${contract.id}`}
                      className="flex flex-1 items-start justify-between gap-4"
                    >
                      <div className="flex items-start gap-3">
                        <InitialAvatar name={contract.payerName} />
                        <div>
                          <p className="text-body font-medium text-content-primary">{contract.payerName}</p>
                          <p className="text-body text-content-secondary">{contract.description ?? "—"}</p>
                          <p className="mt-1 flex items-center gap-1.5 font-mono text-aux text-content-muted">
                            <FileText className="size-3" strokeWidth={1.75} />
                            {contract.installmentsCount} parcela{contract.installmentsCount === 1 ? "" : "s"}
                            {risk?.nextDueDate && (
                              <>
                                <span aria-hidden="true">·</span>
                                <CalendarClock className="size-3" strokeWidth={1.75} />
                                vence {risk.nextDueDate}
                              </>
                            )}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <span className="font-num text-metric text-content-primary tabular-nums">
                          <Money value={contract.principalCents} />
                        </span>
                        <ContractStatusChip status={statusKey} />
                      </div>
                    </Link>
                    <RowMenu actions={[{ label: "Editar", href: `/t/${tenantSlug}/contracts/${contract.id}/edit` }]} />
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Rail direita (DESIGN.md v6 §4.7.2) — widgets reais, derivados de `listContractRiskInfo` (já buscado acima, sem query extra). */}
        {contracts.length > 0 && (
          <aside className="flex w-full flex-col gap-2 lg:w-rail lg:shrink-0">
            <Eyebrow>Vencendo em 7 dias</Eyebrow>
            {upcoming.length === 0 ? (
              <div className="cartao-rail">
                <p className="text-body text-content-muted">Nenhum contrato vencendo nos próximos 7 dias.</p>
              </div>
            ) : (
              upcoming.slice(0, 5).map(({ contract, risk }) => (
                <Link
                  key={contract.id}
                  href={`/t/${tenantSlug}/contracts/${contract.id}`}
                  className="cartao-rail flex items-center justify-between gap-3 transition-colors duration-150 hover:border-line-strong"
                >
                  <div className="overflow-hidden">
                    <p className="truncate text-body text-content-primary">{contract.payerName}</p>
                    <p className="font-mono text-aux text-content-muted">Vence {risk!.nextDueDate}</p>
                  </div>
                </Link>
              ))
            )}

            {onTimeRate != null && (
              <div className="cartao-rail mt-2">
                <span className="font-mono text-micro tracking-micro text-content-secondary uppercase">
                  Contratos em dia
                </span>
                <p className="mt-1 font-num text-metric-sm text-content-primary tabular-nums">{onTimeRate}%</p>
              </div>
            )}
          </aside>
        )}
      </div>
    </>
  );
}
