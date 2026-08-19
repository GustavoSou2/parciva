import { requireTenantSession } from "@/app/_lib/require-tenant-session";
import { requirePermission } from "@/modules/identity";
import { isErr } from "@/shared/result";
import { Card } from "@/ui/components/Card";
import { Eyebrow } from "@/ui/components/Eyebrow";
import { Field } from "@/ui/components/Field";
import { Input } from "@/ui/components/Input";
import { Button } from "@/ui/components/Button";
import { ErrorNote } from "@/ui/components/ErrorNote";
import { createPayerAction } from "../actions";

const ERROR_LABELS: Record<string, string> = {
  empty_name: "Informe o nome do pagador.",
  invalid_document: "CPF/CNPJ inválido.",
  duplicate_document: "Já existe um pagador com esse documento.",
  unauthorized: "Você não tem permissão para criar pagadores.",
};

export default async function NewPayerPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { tenantSlug } = await params;
  const session = await requireTenantSession(tenantSlug);
  const canWrite = !isErr(requirePermission(session.role, "contracts:write"));
  const { error } = await searchParams;
  const boundAction = createPayerAction.bind(null, tenantSlug);

  return (
    <>
      <Eyebrow>Novo pagador</Eyebrow>
      <Card>
        {!canWrite ? (
          <p className="text-body text-content-muted">Sem permissão para criar pagadores neste tenant.</p>
        ) : (
          <form action={boundAction} className="flex flex-col gap-card-gap">
            <Field label="Nome">
              <Input name="name" required />
            </Field>
            <Field label="CPF/CNPJ (opcional — identificação por telefone/nome funciona sem ele)">
              <Input name="document" />
            </Field>
            <Field label="Telefone (formato internacional, ex.: +5511999990000)">
              <Input name="phoneE164" />
            </Field>
            {error && <ErrorNote>{ERROR_LABELS[error] ?? "Não foi possível criar o pagador."}</ErrorNote>}
            <Button type="submit" className="self-start">
              Criar pagador
            </Button>
          </form>
        )}
      </Card>
    </>
  );
}
