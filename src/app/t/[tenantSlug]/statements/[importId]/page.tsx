import { notFound } from "next/navigation";
import Link from "next/link";
import { requireTenantSession } from "@/app/_lib/require-tenant-session";
import { getStatementImportById, getStatementLinesByImport } from "@/modules/statements";
import { Card } from "@/ui/components/Card";
import { Eyebrow } from "@/ui/components/Eyebrow";
import { Money } from "@/ui/components/Money";

const MATCH_LABEL: Record<string, string> = {
  auto_e2e: "Casada automaticamente (E2E)",
  manual: "Pagamento criado manualmente",
};

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

  return (
    <>
      <Eyebrow>Extrato — {statementImport.filename}</Eyebrow>
      <Card>
        {lines.length === 0 ? (
          <p className="text-body text-content-muted">Nenhuma linha de crédito neste extrato.</p>
        ) : (
          <table className="w-full text-left text-body">
            <thead>
              <tr className="border-b border-line-hairline text-content-secondary">
                <th className="pb-2 font-medium">Data</th>
                <th className="pb-2 font-medium">Descrição</th>
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
                  <td className="py-2 font-num tabular-nums">
                    <Money value={line.amountCents} />
                  </td>
                  <td className="py-2 text-content-secondary">
                    {line.matchKind ? MATCH_LABEL[line.matchKind] ?? line.matchKind : "Sem match"}
                  </td>
                  <td className="py-2">
                    {!line.matchKind && (
                      <Link
                        href={`/t/${tenantSlug}/statements/${importId}/lines/${line.id}`}
                        className="text-content-primary hover:underline"
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
