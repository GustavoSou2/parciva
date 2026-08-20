import { Eyebrow } from "@/ui/components/Eyebrow";
import { Modal } from "@/ui/components/Modal";
import { NewContractFormContent } from "../../../contracts/new/NewContractForm";

export default function NewContractModal(props: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  return (
    <Modal>
      <Eyebrow>Novo contrato</Eyebrow>
      <div className="mt-3">
        <NewContractFormContent {...props} />
      </div>
    </Modal>
  );
}
