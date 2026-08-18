import { Card } from "@/ui/components/Card";
import { Eyebrow } from "@/ui/components/Eyebrow";
import { Money } from "@/ui/components/Money";
import { getGlobalMetrics } from "./_lib/queries";

export default async function AdminDashboardPage() {
  const metrics = await getGlobalMetrics();

  return (
    <main className="grid grid-cols-4 gap-card-gap p-card-pad">
      <Card>
        <Eyebrow>Tenants ativos</Eyebrow>
        <p className="font-num tabular-nums">{metrics.activeTenants}</p>
      </Card>
      <Card>
        <Eyebrow>Comprovantes hoje</Eyebrow>
        <p className="font-num tabular-nums">{metrics.receiptsToday}</p>
      </Card>
      <Card>
        <Eyebrow>Custo de IA hoje</Eyebrow>
        <Money value={metrics.aiCostTodayCents} />
      </Card>
      <Card>
        <Eyebrow>Fila de revisão</Eyebrow>
        <p className="font-num tabular-nums">{metrics.reviewQueueSize}</p>
      </Card>
    </main>
  );
}
