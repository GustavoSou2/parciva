import { Card } from "@/ui/components/Card";
import { Eyebrow } from "@/ui/components/Eyebrow";
import { StatementLineFormContent, type StatementLinePageParams } from "./StatementLineForm";

export default async function StatementLineDetailPage(props: StatementLinePageParams) {
  const { context, form } = await StatementLineFormContent(props);

  return (
    <>
      <Eyebrow>Criar pagamento a partir da linha</Eyebrow>
      {context && <Card>{context}</Card>}
      <Card>{form}</Card>
    </>
  );
}
