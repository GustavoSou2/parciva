import { Card } from "@/ui/components/Card";
import { Eyebrow } from "@/ui/components/Eyebrow";
import { EditContractFormContent, type EditContractPageParams } from "./EditContractForm";

export default function EditContractPage(props: EditContractPageParams) {
  return (
    <>
      <Eyebrow>Editar contrato</Eyebrow>
      <Card>
        <EditContractFormContent {...props} />
      </Card>
    </>
  );
}
