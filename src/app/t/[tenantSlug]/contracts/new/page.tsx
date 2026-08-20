import { Card } from "@/ui/components/Card";
import { Eyebrow } from "@/ui/components/Eyebrow";
import { NewContractFormContent, type NewContractPageParams } from "./NewContractForm";

export default function NewContractPage(props: NewContractPageParams) {
  return (
    <>
      <Eyebrow>Novo contrato</Eyebrow>
      <Card>
        <NewContractFormContent {...props} />
      </Card>
    </>
  );
}
