import { notFound } from "next/navigation";
import { requireTenantSession } from "@/app/_lib/require-tenant-session";
import { getContractById } from "@/modules/contracts";
import { requirePermission } from "@/modules/identity";
import { isErr } from "@/shared/result";
import { Field } from "@/ui/components/Field";
import { Input } from "@/ui/components/Input";
import { Button } from "@/ui/components/Button";
import { ErrorNote } from "@/ui/components/ErrorNote";
import { updateContractAction } from "../../actions";

const ERROR_LABELS: Record<string, string> = {
  duplicate_external_ref: "Já existe outro contrato com essa referência.",
  unauthorized: "Você não tem permissão para editar contratos.",
};

export type EditContractPageParams = {
  params: Promise<{ tenantSlug: string; contractId: string }>;
  searchParams: Promise<{ error?: string }>;
};

/** Conteúdo puro — ver comentário equivalente em `contracts/new/NewContractForm.tsx`. */
export async function EditContractFormContent({ params, searchParams }: EditContractPageParams) {
  const { tenantSlug, contractId } = await params;
  const session = await requireTenantSession(tenantSlug);
  const canWrite = !isErr(requirePermission(session.role, "contracts:write"));
  const { error } = await searchParams;

  const contract = await getContractById({ tenantId: session.tenantId }, contractId);
  if (!contract) notFound();

  const boundAction = updateContractAction.bind(null, tenantSlug, contractId);

  if (!canWrite) {
    return <p className="text-body text-content-muted">Sem permissão para editar contratos neste tenant.</p>;
  }

  return (
    <form action={boundAction} className="flex flex-col gap-card-gap">
      <Field label="Descrição">
        <Input name="description" defaultValue={contract.description ?? ""} />
      </Field>
      <Field label="Referência externa">
        <Input name="externalRef" defaultValue={contract.externalRef ?? ""} />
      </Field>
      <p className="text-body text-content-muted">
        Principal, número de parcelas, data de início e política de adiantamento não podem ser alterados
        depois que o contrato é criado.
      </p>
      {error && <ErrorNote>{ERROR_LABELS[error] ?? "Não foi possível salvar as alterações."}</ErrorNote>}
      <Button type="submit" className="self-start">
        Salvar
      </Button>
    </form>
  );
}
