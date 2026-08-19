import { notFound } from "next/navigation";
import Link from "next/link";
import { requireTenantSession } from "@/app/_lib/require-tenant-session";
import { getStatementLineById } from "@/modules/statements";
import { listContractsByPayer } from "@/modules/contracts";
import { listPayers } from "@/modules/payers";
import { requirePermission } from "@/modules/identity";
import { isErr } from "@/shared/result";
import { Card } from "@/ui/components/Card";
import { Eyebrow } from "@/ui/components/Eyebrow";
import { Field } from "@/ui/components/Field";
import { Input, Select } from "@/ui/components/Input";
import { Button } from "@/ui/components/Button";
import { ErrorNote } from "@/ui/components/ErrorNote";
import { Money } from "@/ui/components/Money";
import { createPaymentFromLineAction } from "../../../actions";

const ERROR_LABELS: Record<string, string> = {
  invalid_amount: "Valor do pagamento inválido.",
  contract_not_found: "Contrato não encontrado.",
  no_eligible_installments: "Este contrato não tem parcela elegível para receber o pagamento.",
  duplicate_transaction: "Já existe um pagamento com essa referência — provável duplicidade.",
  unauthorized: "Você não tem permissão para registrar pagamentos.",
};

/** "1500,00" — mesmo formato que `fromReais` aceita de volta (ver `review/[proposalId]/page.tsx`). */
function centsToPlainReais(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

export default async function StatementLineDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string; importId: string; lineId: string }>;
  searchParams: Promise<{ error?: string; payerId?: string }>;
}) {
  const { tenantSlug, importId, lineId } = await params;
  const { error, payerId: payerIdParam } = await searchParams;
  const session = await requireTenantSession(tenantSlug);
  const canWrite = !isErr(requirePermission(session.role, "payments:write"));
  const ctx = { tenantId: session.tenantId };

  const line = await getStatementLineById(ctx, lineId);
  if (!line || line.statementImportId !== importId) notFound();

  if (line.matchKind) {
    return (
      <>
        <Eyebrow>Linha de extrato</Eyebrow>
        <Card>
          <p className="text-body text-content-primary">
            Esta linha já foi conciliada — volte pra{" "}
            <Link href={`/t/${tenantSlug}/statements/${importId}`} className="text-content-primary hover:underline">
              lista do extrato
            </Link>
            .
          </p>
        </Card>
      </>
    );
  }

  const [contracts, payers] = await Promise.all([
    payerIdParam ? listContractsByPayer(ctx, payerIdParam) : Promise.resolve([]),
    payerIdParam ? Promise.resolve([]) : listPayers(ctx),
  ]);

  const createPayment = createPaymentFromLineAction.bind(null, tenantSlug, importId, lineId);

  return (
    <>
      <Eyebrow>Criar pagamento a partir da linha</Eyebrow>
      <Card className="flex flex-col gap-2">
        <p className="text-body text-content-secondary">{line.occurredAt.toISOString().slice(0, 10)}</p>
        <p className="text-body text-content-primary">{line.description}</p>
        <p className="font-num text-metric text-content-primary tabular-nums">
          <Money value={line.amountCents} />
        </p>
      </Card>

      {!canWrite ? (
        <Card>
          <p className="text-body text-content-muted">Sem permissão para registrar pagamentos neste tenant.</p>
        </Card>
      ) : (
        <Card>
          {!payerIdParam ? (
            payers.length === 0 ? (
              <p className="text-body text-content-muted">Nenhum pagador cadastrado ainda.</p>
            ) : (
              <form method="GET" className="flex flex-col gap-card-gap">
                <Field label="Pagador">
                  <Select name="payerId" required defaultValue="">
                    <option value="" disabled>
                      Selecione…
                    </option>
                    {payers.map((payer) => (
                      <option key={payer.id} value={payer.id}>
                        {payer.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Button type="submit" className="self-start">
                  Selecionar pagador
                </Button>
              </form>
            )
          ) : contracts.length === 0 ? (
            <p className="text-body text-content-muted">
              Este pagador não tem contrato ativo.{" "}
              <Link
                href={`/t/${tenantSlug}/statements/${importId}/lines/${lineId}`}
                className="text-content-primary hover:underline"
              >
                Escolher outro pagador
              </Link>
              .
            </p>
          ) : (
            <form action={createPayment} className="flex flex-col gap-card-gap">
              <input type="hidden" name="payerId" value={payerIdParam} />
              <Field label="Contrato">
                <Select name="contractId" required>
                  {contracts.map((contract) => (
                    <option key={contract.id} value={contract.id}>
                      {contract.description ?? contract.id}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Valor (R$)">
                <Input name="amount" required defaultValue={centsToPlainReais(line.amountCents)} />
              </Field>
              <Field label="Data do pagamento">
                <Input name="paidAt" type="date" defaultValue={line.occurredAt.toISOString().slice(0, 10)} />
              </Field>
              <Field label="Forma">
                <Select name="method" defaultValue="pix">
                  <option value="pix">PIX</option>
                  <option value="ted">TED</option>
                  <option value="boleto">Boleto</option>
                  <option value="cash">Dinheiro</option>
                  <option value="card">Cartão</option>
                  <option value="other">Outro</option>
                </Select>
              </Field>
              <Field label="Referência da transação (opcional)">
                <Input name="transactionRef" defaultValue={line.extractedRef ?? ""} />
              </Field>
              {error && <ErrorNote>{ERROR_LABELS[error] ?? "Não foi possível registrar o pagamento."}</ErrorNote>}
              <Button type="submit" className="self-start">
                Registrar pagamento
              </Button>
            </form>
          )}
        </Card>
      )}
    </>
  );
}
