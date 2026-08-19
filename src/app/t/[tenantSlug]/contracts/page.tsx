import Link from "next/link";
import { requireTenantSession } from "@/app/_lib/require-tenant-session";
import { listContracts } from "@/modules/contracts";
import { requirePermission } from "@/modules/identity";
import { isErr } from "@/shared/result";
import { Card } from "@/ui/components/Card";
import { Eyebrow } from "@/ui/components/Eyebrow";
import { Money } from "@/ui/components/Money";
import { buttonClassName } from "@/ui/components/Button";

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
      <Card>
        {contracts.length === 0 ? (
          <p className="text-body text-content-muted">
            Nenhum contrato ainda. Assim que criar um, ele aparece aqui.
          </p>
        ) : (
          <table className="w-full text-left text-body">
            <thead>
              <tr className="border-b border-line-hairline text-content-secondary">
                <th className="pb-2 font-medium">Pagador</th>
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
                      className="text-content-primary hover:underline"
                    >
                      {contract.payerName}
                    </Link>
                  </td>
                  <td className="py-2 text-content-secondary">{contract.description ?? "—"}</td>
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
    </>
  );
}
