import { Eyebrow } from "@/ui/components/Eyebrow";
import { Modal } from "@/ui/components/Modal";
import { StatementLineFormContent } from "../../../../../statements/[importId]/lines/[lineId]/StatementLineForm";

export default async function StatementLineModal(props: {
  params: Promise<{ tenantSlug: string; importId: string; lineId: string }>;
  searchParams: Promise<{ error?: string; payerId?: string }>;
}) {
  const { context, form } = await StatementLineFormContent(props);

  return (
    <Modal>
      <Eyebrow>Criar pagamento a partir da linha</Eyebrow>
      {context && <div className="mt-3 border-b border-line-hairline pb-4">{context}</div>}
      <div className="mt-4">{form}</div>
    </Modal>
  );
}
