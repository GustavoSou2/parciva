import { notFound } from "next/navigation";
import { requireTenantSession } from "@/app/_lib/require-tenant-session";
import { getPayerById } from "@/modules/payers";
import { requirePermission } from "@/modules/identity";
import { isErr } from "@/shared/result";
import { Card } from "@/ui/components/Card";
import { Eyebrow } from "@/ui/components/Eyebrow";
import { Field } from "@/ui/components/Field";
import { Input } from "@/ui/components/Input";
import { Button } from "@/ui/components/Button";
import { ErrorNote } from "@/ui/components/ErrorNote";
import { updatePayerAction } from "../../actions";

const ERROR_LABELS: Record<string, string> = {
  empty_name: "Informe o nome do pagador.",
  invalid_document: "CPF/CNPJ inválido.",
  duplicate_document: "Já existe outro pagador com esse documento.",
  unauthorized: "Você não tem permissão para editar pagadores.",
};

export default async function EditPayerPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string; payerId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { tenantSlug, payerId } = await params;
  const session = await requireTenantSession(tenantSlug);
  const canWrite = !isErr(requirePermission(session.role, "contracts:write"));
  const { error } = await searchParams;

  const payer = await getPayerById({ tenantId: session.tenantId }, payerId);
  if (!payer) notFound();

  const boundAction = updatePayerAction.bind(null, tenantSlug, payerId);

  return (
    <>
      <Eyebrow>Editar pagador</Eyebrow>
      <Card>
        {!canWrite ? (
          <p className="text-body text-content-muted">Sem permissão para editar pagadores neste tenant.</p>
        ) : (
          <form action={boundAction} className="flex flex-col gap-card-gap">
            <Field label="Nome">
              <Input name="name" required defaultValue={payer.name} />
            </Field>
            <Field label="CPF/CNPJ (opcional — identificação por telefone/nome funciona sem ele)">
              <Input name="document" defaultValue={payer.documentMasked ?? ""} />
            </Field>
            <Field label="Telefone (formato internacional, ex.: +5511999990000)">
              <Input name="phoneE164" defaultValue={payer.phoneE164 ?? ""} />
            </Field>
            {error && <ErrorNote>{ERROR_LABELS[error] ?? "Não foi possível salvar as alterações."}</ErrorNote>}
            <Button type="submit" className="self-start">
              Salvar
            </Button>
          </form>
        )}
      </Card>
    </>
  );
}
