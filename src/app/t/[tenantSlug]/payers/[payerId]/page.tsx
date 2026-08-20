import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenantSession } from "@/app/_lib/require-tenant-session";
import { getPayerById, getPayerDelinquencyStats, computeDelinquencyBadge } from "@/modules/payers";
import { listContractsByPayer } from "@/modules/contracts";
import { requirePermission } from "@/modules/identity";
import { isErr } from "@/shared/result";
import { Card } from "@/ui/components/Card";
import { Eyebrow } from "@/ui/components/Eyebrow";
import { Money } from "@/ui/components/Money";
import { Button } from "@/ui/components/Button";
import { buttonClassName } from "@/ui/components/button-class-name";
import { PayerStatusChip } from "@/ui/components/StatusChip";
import { sum } from "@/shared/money";
import { setPayerStatusAction } from "../actions";

export default async function PayerDetailPage({
  params,
}: {
  params: Promise<{ tenantSlug: string; payerId: string }>;
}) {
  const { tenantSlug, payerId } = await params;
  const session = await requireTenantSession(tenantSlug);
  const canWrite = !isErr(requirePermission(session.role, "contracts:write"));
  const ctx = { tenantId: session.tenantId };

  const payer = await getPayerById(ctx, payerId);
  if (!payer) notFound();

  const [contracts, delinquencyStats] = await Promise.all([
    listContractsByPayer(ctx, payerId),
    getPayerDelinquencyStats(ctx, payerId),
  ]);
  const isActive = payer.status !== "inactive";
  const toggleStatus = setPayerStatusAction.bind(null, tenantSlug, payerId, isActive ? "inactive" : "active");
  const delinquencyBadge = computeDelinquencyBadge(delinquencyStats);

  // Versão leve do §4.7.1 (DESIGN.md v6) — reduce sobre o MESMO
  // `contracts` já buscado acima, nenhuma query nova.
  const activeContracts = contracts.filter((c) => c.status !== "cancelled");
  const totalPrincipal = sum(contracts.map((c) => c.principalCents));

  return (
    <>
      <div className="flex items-center justify-between">
        <Eyebrow>Pagador</Eyebrow>
        {canWrite && (
          <div className="flex gap-2">
            <Link href={`/t/${tenantSlug}/payers/${payerId}/edit`} className={buttonClassName("secondary")}>
              Editar
            </Link>
            <form action={toggleStatus}>
              <Button type="submit" variant="secondary">
                {isActive ? "Desativar" : "Reativar"}
              </Button>
            </form>
          </div>
        )}
      </div>
      <Card>
        <p className="text-title text-content-primary">
          {payer.name} {!isActive && <PayerStatusChip status="inactive" />}
        </p>
        <p className="mt-2 text-body text-content-secondary">
          Documento: {payer.documentMasked ?? "não informado"}
        </p>
        <p className="text-body text-content-secondary">
          Telefone: {payer.phoneE164 ?? "não informado"}
        </p>
      </Card>

      {/* Resumo leve (DESIGN.md v6 §4.7.1) */}
      {contracts.length > 0 && (
        <div className="flex flex-wrap gap-6 rounded-card border-hairline border-line-hairline bg-surface-card p-4 shadow-card sm:p-card-pad">
          <div>
            <span className="font-mono text-micro tracking-micro text-content-secondary uppercase">
              Contratos
            </span>
            <p className="mt-1 font-num text-metric-sm text-content-primary tabular-nums">{contracts.length}</p>
          </div>
          <div>
            <span className="font-mono text-micro tracking-micro text-content-secondary uppercase">Ativos</span>
            <p className="mt-1 font-num text-metric-sm text-content-primary tabular-nums">
              {activeContracts.length}
            </p>
          </div>
          <div>
            <span className="font-mono text-micro tracking-micro text-content-secondary uppercase">
              Valor total
            </span>
            <p className="mt-1 font-num text-metric-sm text-content-primary tabular-nums">
              <Money value={totalPrincipal} />
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-card-gap lg:flex-row">
        <div className="flex-1">
          <Eyebrow>Contratos</Eyebrow>
          <Card>
            {contracts.length === 0 ? (
              <p className="text-body text-content-muted">
                Nenhum contrato ainda. Assim que criar um pra este pagador, ele aparece aqui.
              </p>
            ) : (
              <table className="w-full text-left text-body">
                <thead>
                  <tr className="border-b border-line-hairline text-content-secondary">
                    <th className="pb-2 font-medium">Descrição</th>
                    <th className="pb-2 font-medium">Principal</th>
                    <th className="pb-2 font-medium">Parcelas</th>
                  </tr>
                </thead>
                <tbody>
                  {contracts.map((contract) => (
                    <tr key={contract.id} className="border-b border-line-hairline">
                      <td className="py-2">
                        <Link
                          href={`/t/${tenantSlug}/contracts/${contract.id}`}
                          className="text-accent hover:underline"
                        >
                          {contract.description ?? contract.id}
                        </Link>
                      </td>
                      <td className="py-2 font-num tabular-nums">
                        <Money value={contract.principalCents} />
                      </td>
                      <td className="py-2 text-content-secondary">{contract.installmentsCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>

        {/*
          Rail direita (DESIGN.md v6 §4.7.2) — selo de risco real
          (§7.9). "Linha do tempo de pontualidade" (mini sparkline) da
          tabela do prompt não construída: exigiria cruzar
          `payment_allocations`/`payments.paid_at` contra
          `installments.due_date` por alocação pra saber "pago em dia
          vs. pago atrasado" — não é leitura de uma tabela só, ver
          CHANGELOG (próximo passo), não bloqueia esta rodada.
        */}
        {delinquencyBadge && (
          <aside className="w-full lg:w-rail lg:shrink-0">
            <Eyebrow>Selo de risco</Eyebrow>
            <div className="cartao-rail">
              <span className={delinquencyBadge.hasRisk ? "selo-tendencia-baixa" : "selo-tendencia-alta"}>
                {delinquencyBadge.label}
              </span>
            </div>
          </aside>
        )}
      </div>
    </>
  );
}
