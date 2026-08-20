import { Card } from "@/ui/components/Card";
import { Eyebrow } from "@/ui/components/Eyebrow";
import { NewPayerFormContent, type NewPayerPageParams } from "./NewPayerForm";

export default function NewPayerPage(props: NewPayerPageParams) {
  return (
    <>
      <Eyebrow>Novo pagador</Eyebrow>
      <Card>
        <NewPayerFormContent {...props} />
      </Card>
    </>
  );
}
