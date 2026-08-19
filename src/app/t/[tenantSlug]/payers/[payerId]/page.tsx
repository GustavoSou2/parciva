import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenantSession } from "@/app/_lib/require-tenant-session";
import { getPayerById } from "@/modules/payers";
import { listContractsByPayer } from "@/modules/contracts";
import { requirePermission } from "@/modules/identity";
import { isErr } from "@/shared/result";
import { Card } from "@/ui/components/Card";
import { Eyebrow } from "@/ui/components/Eyebrow";
import { Money } from "@/ui/components/Money";
import { Button, buttonClassName } from "@/ui/components/Button";
import { StatusChip } from "@/ui/components/StatusChip";
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

  const contracts = await listContractsByPayer(ctx, payerId);
  const isActive = payer.status !== "inactive";
  const toggleStatus = setPayerStatusAction.bind(null, tenantSlug, payerId, isActive ? "inactive" : "active");

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
          {payer.name} {!isActive && <StatusChip status="inactive" />}
        </p>
        <p className="mt-2 text-body text-content-secondary">
          Documento: {payer.documentMasked ?? "não informado"}
        </p>
        <p className="text-body text-content-secondary">
          Telefone: {payer.phoneE164 ?? "não informado"}
        </p>
      </Card>

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
                      className="text-content-primary hover:underline"
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
    </>
  );
}
