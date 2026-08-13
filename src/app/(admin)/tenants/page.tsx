import { Card } from "@/ui/components/Card";

// TODO: buscar via getAdminDb() — lista abaixo é stub com 2 tenants de exemplo.
const TENANTS = [
  {
    name: "Padaria São Jorge",
    slug: "padaria-sao-jorge",
    status: "active",
    plan: "essential",
    createdAt: "2026-02-01",
  },
  {
    name: "Oficina do Zé",
    slug: "oficina-do-ze",
    status: "trial",
    plan: "free",
    createdAt: "2026-07-15",
  },
];

export default function AdminTenantsPage() {
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
              <th>Criado em</th>
            </tr>
          </thead>
          <tbody>
            {TENANTS.map((tenant) => (
              <tr key={tenant.slug} className="border-b border-line-hairline">
                <td>{tenant.name}</td>
                <td>{tenant.slug}</td>
                <td>{tenant.status}</td>
                <td>{tenant.plan}</td>
                <td>{tenant.createdAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </main>
  );
}
