import Link from "next/link";
import { requireTenantSession } from "@/app/_lib/require-tenant-session";
import { listPayers } from "@/modules/payers";
import { Card } from "@/ui/components/Card";
import { Eyebrow } from "@/ui/components/Eyebrow";
import { buttonClassName } from "@/ui/components/Button";

export default async function PayersPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const session = await requireTenantSession(tenantSlug);
  const payers = await listPayers({ tenantId: session.tenantId });

  return (
    <>
      <div className="flex items-center justify-between">
        <Eyebrow>Pagadores</Eyebrow>
        <Link href={`/t/${tenantSlug}/payers/new`} className={buttonClassName("secondary")}>
          Novo pagador
        </Link>
      </div>
      <Card>
        {payers.length === 0 ? (
          <p className="text-body text-content-muted">
            Nenhum pagador cadastrado ainda. Assim que criar um, ele aparece aqui.
          </p>
        ) : (
          <table className="w-full text-left text-body">
            <thead>
              <tr className="border-b border-line-hairline text-content-secondary">
                <th className="pb-2 font-medium">Nome</th>
                <th className="pb-2 font-medium">Documento</th>
                <th className="pb-2 font-medium">Telefone</th>
              </tr>
            </thead>
            <tbody>
              {payers.map((payer) => (
                <tr key={payer.id} className="border-b border-line-hairline">
                  <td className="py-2">
                    <Link
                      href={`/t/${tenantSlug}/payers/${payer.id}`}
                      className="text-content-primary hover:underline"
                    >
                      {payer.name}
                    </Link>
                  </td>
                  <td className="py-2 text-content-secondary">{payer.documentMasked ?? "—"}</td>
                  <td className="py-2 text-content-secondary">{payer.phoneE164 ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
