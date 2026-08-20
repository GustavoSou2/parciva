import { Eyebrow } from "@/ui/components/Eyebrow";
import { Modal } from "@/ui/components/Modal";
import { EditContractFormContent } from "../../../../contracts/[contractId]/edit/EditContractForm";

export default function EditContractModal(props: {
  params: Promise<{ tenantSlug: string; contractId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  return (
    <Modal>
      <Eyebrow>Editar contrato</Eyebrow>
      <div className="mt-3">
        <EditContractFormContent {...props} />
      </div>
    </Modal>
  );
}
