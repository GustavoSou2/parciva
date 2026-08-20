import Link from "next/link";
import { FileText } from "lucide-react";
import { requireTenantSession } from "@/app/_lib/require-tenant-session";
import { listContracts } from "@/modules/contracts";
import { requirePermission } from "@/modules/identity";
import { isErr } from "@/shared/result";
import { Eyebrow } from "@/ui/components/Eyebrow";
import { Money } from "@/ui/components/Money";
import { StatusChip, getCardStateBg } from "@/ui/components/StatusChip";
import { buttonClassName } from "@/ui/components/button-class-name";

/**
 * Lista de contratos — cartão por contrato em vez de tabela crua, mesmo
 * padrão de `CronogramaCards.tsx` (DESIGN.md §12/style-guide.md §4.2):
 * pastel de estado no cartão inteiro, valor em destaque (§1.5 item 1),
 * ícone da entidade herdado do item ativo da sidebar (mesma identidade
 * visual, "Contratos" = `FileText` nos dois lugares).
 */
export default async function ContractsPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const session = await requireTenantSession(tenantSlug);
  const canWrite = !isErr(requirePermission(session.role, "contracts:write"));
  const contracts = await listContracts({ tenantId: session.tenantId });

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
            return (
              <li
                key={contract.id}
                className={`rounded-card border-hairline border-line-hairline p-card-pad shadow-card transition-colors duration-150 hover:border-line-strong ${getCardStateBg(statusKey)}`}
              >
                <Link
                  href={`/t/${tenantSlug}/contracts/${contract.id}`}
                  className="flex items-start justify-between gap-4"
                >
                  <div className="flex items-start gap-3">
                    <FileText className="mt-0.5 size-4 shrink-0 text-content-secondary" strokeWidth={1.75} />
                    <div>
                      <p className="text-body font-medium text-content-primary">{contract.payerName}</p>
                      <p className="text-body text-content-secondary">{contract.description ?? "—"}</p>
                      <p className="mt-1 font-mono text-aux text-content-muted">
                        {contract.installmentsCount} parcela{contract.installmentsCount === 1 ? "" : "s"}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span className="font-num text-metric text-content-primary tabular-nums">
                      <Money value={contract.principalCents} />
                    </span>
                    <StatusChip status={statusKey} />
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
