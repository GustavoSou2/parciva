import { Card } from "@/ui/components/Card";
import { Eyebrow } from "@/ui/components/Eyebrow";
import { EditPayerFormContent, type EditPayerPageParams } from "./EditPayerForm";

export default function EditPayerPage(props: EditPayerPageParams) {
  return (
    <>
      <Eyebrow>Editar pagador</Eyebrow>
      <Card>
        <EditPayerFormContent {...props} />
      </Card>
    </>
  );
}
