import { notFound } from "next/navigation";
import { requireTenantSession } from "@/app/_lib/require-tenant-session";
import { getContractById, listInstallmentsByContract } from "@/modules/contracts";
import { getPayerById } from "@/modules/payers";
import { listEntriesForContract } from "@/modules/ledger";
import { listPaymentsByContract } from "@/modules/reconciliation";
import { Card } from "@/ui/components/Card";
import { Eyebrow } from "@/ui/components/Eyebrow";
import { Field } from "@/ui/components/Field";
import { Input, Select } from "@/ui/components/Input";
import { Button } from "@/ui/components/Button";
import { ErrorNote } from "@/ui/components/ErrorNote";
import { Money } from "@/ui/components/Money";
import { StatusChip } from "@/ui/components/StatusChip";
import { registerPaymentAction, reversePaymentAction } from "../actions";

/**
 * `payments.verification_level` (decisão [5]) só tem chip pra
 * `unverified`/`document` hoje — `statement`/`psp_confirmed` são das
 * Fases 5/6, o registro manual deste marco nunca produz esses valores.
 * Fallback pra `unverified` é seguro (rótulo mais conservador, nunca
 * "confirmado" sem confirmação real do PSP).
 */
function verificationChipStatus(level: string): "unverified" | "document" {
  return level === "document" ? "document" : "unverified";
}

const PAYMENT_ERROR_LABELS: Record<string, string> = {
  invalid_amount: "Valor do pagamento inválido.",
  contract_not_found: "Contrato não encontrado.",
  duplicate_transaction: "Já existe um pagamento com essa referência — provável duplicidade.",
  payment_not_found: "Pagamento não encontrado.",
  already_reversed: "Este pagamento já foi estornado.",
};

export default async function ContractDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string; contractId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { tenantSlug, contractId } = await params;
  const session = await requireTenantSession(tenantSlug);
  const ctx = { tenantId: session.tenantId };
  const { error } = await searchParams;

  const contract = await getContractById(ctx, contractId);
  if (!contract) notFound();

  const [payer, installments, entries, paymentsList] = await Promise.all([
    getPayerById(ctx, contract.payerId),
    listInstallmentsByContract(ctx, contractId),
    listEntriesForContract(ctx, contractId),
    listPaymentsByContract(ctx, contractId),
  ]);

  const registerPayment = registerPaymentAction.bind(null, tenantSlug, contractId, contract.payerId);

  return (
    <>
      <Eyebrow>Contrato</Eyebrow>
      <Card>
        <p className="text-title text-content-primary">{payer?.name ?? "Pagador"}</p>
        <p className="mt-1 text-body text-content-secondary">{contract.description ?? "Sem descrição"}</p>
        <p className="mt-3 font-num text-metric text-content-primary tabular-nums">
          <Money value={contract.principalCents} />
        </p>
      </Card>

      <Eyebrow>Cronograma de parcelas</Eyebrow>
      <Card>
        <table className="w-full text-left text-body">
          <thead>
            <tr className="border-b border-line-hairline text-content-secondary">
              <th className="pb-2 font-medium">Nº</th>
              <th className="pb-2 font-medium">Vencimento</th>
              <th className="pb-2 font-medium">Valor</th>
              <th className="pb-2 font-medium">Pago</th>
              <th className="pb-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {installments.map((installment) => (
              <tr key={installment.id} className="border-b border-line-hairline">
                <td className="py-2 text-content-secondary">{installment.number}</td>
                <td className="py-2 text-content-secondary">{installment.dueDate}</td>
                <td className="py-2 font-num tabular-nums">
                  <Money value={installment.amountCents} />
                </td>
                <td className="py-2 font-num tabular-nums">
                  <Money value={installment.paidCents} />
                </td>
                <td className="py-2">
                  <StatusChip status={installment.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Eyebrow>Registrar pagamento manual</Eyebrow>
      <Card>
        <form action={registerPayment} className="flex flex-col gap-card-gap">
          <Field label="Valor (R$)">
            <Input name="amount" required placeholder="150,00" />
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
          <Field label="Referência da transação (opcional — E2E ID do PIX, por exemplo)">
            <Input name="transactionRef" />
          </Field>
          {error && (
            <ErrorNote>
              {PAYMENT_ERROR_LABELS[error] ?? "Não foi possível registrar o pagamento."}
            </ErrorNote>
          )}
          <Button type="submit" className="self-start">
            Registrar
          </Button>
        </form>
      </Card>

      <Eyebrow>Pagamentos</Eyebrow>
      <Card>
        {paymentsList.length === 0 ? (
          <p className="text-body text-content-muted">Nenhum pagamento registrado ainda.</p>
        ) : (
          <table className="w-full text-left text-body">
            <thead>
              <tr className="border-b border-line-hairline text-content-secondary">
                <th className="pb-2 font-medium">Data</th>
                <th className="pb-2 font-medium">Valor</th>
                <th className="pb-2 font-medium">Forma</th>
                <th className="pb-2 font-medium">Status</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {paymentsList.map((payment) => {
                const reverse = reversePaymentAction.bind(null, tenantSlug, contractId, payment.id);
                return (
                  <tr key={payment.id} className="border-b border-line-hairline">
                    <td className="py-2 text-content-secondary">
                      {payment.paidAt.toISOString().slice(0, 10)}
                    </td>
                    <td className="py-2 font-num tabular-nums">
                      <Money value={payment.amountCents} />
                    </td>
                    <td className="py-2 text-content-secondary">{payment.method}</td>
                    <td className="py-2">
                      <StatusChip
                        status={
                          payment.status === "reversed"
                            ? "reversed"
                            : verificationChipStatus(payment.verificationLevel)
                        }
                      />
                    </td>
                    <td className="py-2">
                      {payment.status === "applied" && (
                        <form action={reverse}>
                          <Button type="submit" variant="secondary">
                            Reverter
                          </Button>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      <Eyebrow>Histórico de lançamentos</Eyebrow>
      <Card>
        {entries.length === 0 ? (
          <p className="text-body text-content-muted">Nenhum lançamento ainda.</p>
        ) : (
          <table className="w-full text-left text-body">
            <thead>
              <tr className="border-b border-line-hairline text-content-secondary">
                <th className="pb-2 font-medium">Data</th>
                <th className="pb-2 font-medium">Tipo</th>
                <th className="pb-2 font-medium">Direção</th>
                <th className="pb-2 font-medium">Valor</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} className="border-b border-line-hairline">
                  <td className="py-2 text-content-secondary">
                    {entry.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                  </td>
                  <td className="py-2 text-content-secondary">{entry.entryType}</td>
                  <td className="py-2 text-content-secondary">{entry.direction}</td>
                  <td className="py-2 font-num tabular-nums">
                    <Money value={entry.amountCents} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
