import { Eyebrow } from "@/ui/components/Eyebrow";
import { Modal } from "@/ui/components/Modal";
import { EditPayerFormContent } from "../../../../payers/[payerId]/edit/EditPayerForm";

export default function EditPayerModal(props: {
  params: Promise<{ tenantSlug: string; payerId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  return (
    <Modal>
      <Eyebrow>Editar pagador</Eyebrow>
      <div className="mt-3">
        <EditPayerFormContent {...props} />
      </div>
    </Modal>
  );
}
