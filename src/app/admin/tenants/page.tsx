import { Card } from "@/ui/components/Card";
import { Money } from "@/ui/components/Money";
import { listTenantSummaries } from "../_lib/queries";

export default async function AdminTenantsPage() {
  const tenantsList = await listTenantSummaries();

  return (
    <main className="p-card-pad">
      <Card>
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-line-hairline">
              <th>Nome</th>
              <th>Slug</th>
              <th>Status</th>
              <th>Plano</th>
              <th>Comprovantes no mês</th>
              <th>Custo de IA no mês</th>
              <th>Criado em</th>
            </tr>
          </thead>
          <tbody>
            {tenantsList.map((tenant) => (
              <tr key={tenant.id} className="border-b border-line-hairline">
                <td>{tenant.name}</td>
                <td>{tenant.slug}</td>
                <td>{tenant.status}</td>
                <td>{tenant.planCode}</td>
                <td className="font-num tabular-nums">{tenant.receiptsThisMonth}</td>
                <td className="font-num tabular-nums">
                  <Money value={tenant.aiCostThisMonthCents} />
                </td>
                <td>{tenant.createdAt.toISOString().slice(0, 10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </main>
  );
}
