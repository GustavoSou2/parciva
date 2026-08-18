import Link from "next/link";
import { requireTenantSession } from "@/app/_lib/require-tenant-session";
import { listPayers } from "@/modules/payers";
import { Card } from "@/ui/components/Card";
import { Eyebrow } from "@/ui/components/Eyebrow";
import { Field } from "@/ui/components/Field";
import { Input, Select } from "@/ui/components/Input";
import { Button } from "@/ui/components/Button";
import { ErrorNote } from "@/ui/components/ErrorNote";
import { createContractAction } from "../actions";

const ERROR_LABELS: Record<string, string> = {
  invalid_amount: "Valor do principal inválido.",
  invalid_installments_count: "Número de parcelas inválido.",
  invalid_start_date: "Data de início inválida.",
  duplicate_external_ref: "Já existe um contrato com essa referência.",
};

export default async function NewContractPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { tenantSlug } = await params;
  const session = await requireTenantSession(tenantSlug);
  const { error } = await searchParams;
  const payers = await listPayers({ tenantId: session.tenantId });
  const boundAction = createContractAction.bind(null, tenantSlug);

  return (
    <>
      <Eyebrow>Novo contrato</Eyebrow>
      <Card>
        {payers.length === 0 ? (
          <p className="text-body text-content-muted">
            Nenhum pagador cadastrado ainda —{" "}
            <Link href={`/t/${tenantSlug}/payers/new`} className="text-content-primary hover:underline">
              crie um pagador primeiro
            </Link>
            .
          </p>
        ) : (
          <form action={boundAction} className="flex flex-col gap-card-gap">
            <Field label="Pagador">
              <Select name="payerId" required>
                {payers.map((payer) => (
                  <option key={payer.id} value={payer.id}>
                    {payer.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Descrição (opcional)">
              <Input name="description" />
            </Field>
            <Field label="Principal (R$)">
              <Input name="principal" required placeholder="1.500,00" />
            </Field>
            <Field label="Número de parcelas">
              <Input name="installmentsCount" type="number" min={1} required defaultValue={1} />
            </Field>
            <Field label="Data de início">
              <Input name="startDate" type="date" required />
            </Field>
            <Field label="Sobra de pagamento antecipado">
              <Select name="earlyPaymentPolicy" defaultValue="credit_balance">
                <option value="credit_balance">Guardar como crédito</option>
                <option value="reduce_count">Quitar parcelas futuras</option>
              </Select>
            </Field>
            {error && (
              <ErrorNote>{ERROR_LABELS[error] ?? "Não foi possível criar o contrato."}</ErrorNote>
            )}
            <Button type="submit" className="self-start">
              Criar contrato
            </Button>
          </form>
        )}
      </Card>
    </>
  );
}
