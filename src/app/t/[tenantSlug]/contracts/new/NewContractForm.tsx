import Link from "next/link";
import { requireTenantSession } from "@/app/_lib/require-tenant-session";
import { listPayers } from "@/modules/payers";
import { requirePermission } from "@/modules/identity";
import { isErr } from "@/shared/result";
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
  unauthorized: "Você não tem permissão para criar contratos.",
};

export type NewContractPageParams = {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{ error?: string }>;
};

/**
 * Conteúdo puro do formulário — sem Eyebrow/Card em volta, porque quem
 * envolve muda conforme o contexto: a página cheia (`page.tsx`) usa
 * Card; a versão interceptada em `@modal/(.)contracts/new` usa `Modal`
 * (que já tem seu próprio raio/sombra de cartão — DESIGN.md §1.5 item 6,
 * mesma escala em modal e página). Vive num arquivo à parte porque
 * `page.tsx` só pode exportar os nomes que o Next.js reconhece
 * (`default`, `metadata`, etc.) — uma exportação nomeada extra quebra a
 * checagem de tipos gerada pelo framework.
 */
export async function NewContractFormContent({ params, searchParams }: NewContractPageParams) {
  const { tenantSlug } = await params;
  const session = await requireTenantSession(tenantSlug);
  const canWrite = !isErr(requirePermission(session.role, "contracts:write"));
  const { error } = await searchParams;
  const payers = await listPayers({ tenantId: session.tenantId });
  const boundAction = createContractAction.bind(null, tenantSlug);

  if (!canWrite) {
    return <p className="text-body text-content-muted">Sem permissão para criar contratos neste tenant.</p>;
  }
  if (payers.length === 0) {
    return (
      <p className="text-body text-content-muted">
        Nenhum pagador cadastrado ainda —{" "}
        <Link href={`/t/${tenantSlug}/payers/new`} className="text-content-primary hover:underline">
          crie um pagador primeiro
        </Link>
        .
      </p>
    );
  }

  return (
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
      {error && <ErrorNote>{ERROR_LABELS[error] ?? "Não foi possível criar o contrato."}</ErrorNote>}
      <Button type="submit" className="self-start">
        Criar contrato
      </Button>
    </form>
  );
}
