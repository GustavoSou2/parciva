import { Eyebrow } from "@/ui/components/Eyebrow";
import { Modal } from "@/ui/components/Modal";
import { NewPayerFormContent } from "../../../payers/new/NewPayerForm";

export default function NewPayerModal(props: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  return (
    <Modal>
      <Eyebrow>Novo pagador</Eyebrow>
      <div className="mt-3">
        <NewPayerFormContent {...props} />
      </div>
    </Modal>
  );
}
