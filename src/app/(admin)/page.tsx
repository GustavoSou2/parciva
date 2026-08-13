import { Card } from "@/ui/components/Card";
import { Eyebrow } from "@/ui/components/Eyebrow";
import { Money } from "@/ui/components/Money";
import { ZERO } from "@/shared/money";

// TODO: conectar ao banco via getAdminDb() — métricas abaixo são stub.
export default function AdminDashboardPage() {
  return (
    <main className="grid grid-cols-4 gap-card-gap p-card-pad">
      <Card>
        <Eyebrow>Tenants ativos</Eyebrow>
        <p className="font-num tabular-nums">0</p>
      </Card>
      <Card>
        <Eyebrow>Comprovantes hoje</Eyebrow>
        <p className="font-num tabular-nums">0</p>
      </Card>
      <Card>
        <Eyebrow>Custo de IA hoje</Eyebrow>
        <Money value={ZERO} />
      </Card>
      <Card>
        <Eyebrow>Fila de revisão</Eyebrow>
        <p className="font-num tabular-nums">0</p>
      </Card>
    </main>
  );
}
