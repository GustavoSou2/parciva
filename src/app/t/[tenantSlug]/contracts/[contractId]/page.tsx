import Link from "next/link";
import { notFound } from "next/navigation";
import { Landmark, Wallet, Zap, type LucideIcon } from "lucide-react";
import { requireTenantSession } from "@/app/_lib/require-tenant-session";
import { getContractById, listInstallmentsByContract } from "@/modules/contracts";
import { getPayerById, getPayerDelinquencyStats, computeDelinquencyBadge } from "@/modules/payers";
import { listEntriesForContract } from "@/modules/ledger";
import { listPaymentsByContract, type PaymentMethod } from "@/modules/reconciliation";
import { requirePermission } from "@/modules/identity";
import { isErr } from "@/shared/result";
import { Card } from "@/ui/components/Card";
import { Eyebrow } from "@/ui/components/Eyebrow";
import { Field } from "@/ui/components/Field";
import { Input, Select } from "@/ui/components/Input";
import { Button } from "@/ui/components/Button";
import { buttonClassName } from "@/ui/components/button-class-name";
import { ErrorNote } from "@/ui/components/ErrorNote";
import { Money } from "@/ui/components/Money";
import { StatusChip, ContractStatusChip } from "@/ui/components/StatusChip";
import { money, sum } from "@/shared/money";
import { cancelContractAction, registerPaymentAction, reversePaymentAction } from "../actions";
import { CronogramaCards } from "./CronogramaCards";

const METHOD_LABEL: Record<PaymentMethod, string> = {
  pix: "PIX",
  ted: "TED",
  doc: "DOC",
  boleto: "Boleto",
  cash: "Dinheiro",
  card: "Cartão",
  other: "Outro",
};

/**
 * Chip tintado por método de pagamento (DESIGN.md v6 §2.6/§7.4) —
 * linha de lista densa, 7 valores reais de `payment_method` (enum do
 * schema) agrupados nos 3 tons existentes (`chip-1..3`, máximo do
 * sistema): nunca um 4º/5º tom inventado por método, o agrupamento é
 * por "como o dinheiro se move", não decoração.
 */
const METHOD_CHIP: Record<PaymentMethod, { bg: string; icon: LucideIcon }> = {
  pix: { bg: "bg-chip-1", icon: Zap },
  ted: { bg: "bg-chip-2", icon: Landmark },
  doc: { bg: "bg-chip-2", icon: Landmark },
  boleto: { bg: "bg-chip-2", icon: Landmark },
  cash: { bg: "bg-chip-3", icon: Wallet },
  card: { bg: "bg-chip-3", icon: Wallet },
  other: { bg: "bg-chip-3", icon: Wallet },
};

function PaymentMethodChip({ method }: { method: PaymentMethod }) {
  const { bg, icon: Icon } = METHOD_CHIP[method];
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`chip-icone ${bg}`} aria-hidden="true">
        <Icon className="size-3.5 text-content-primary" strokeWidth={1.75} />
      </span>
      <span className="text-content-secondary">{METHOD_LABEL[method]}</span>
    </span>
  );
}

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
  unauthorized: "Você não tem permissão para registrar ou reverter pagamentos.",
  already_cancelled: "Este contrato já foi cancelado.",
};

export default async function ContractDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string; contractId: string }>;
  searchParams: Promise<{ error?: string; justConfirmed?: string }>;
}) {
  const { tenantSlug, contractId } = await params;
  const session = await requireTenantSession(tenantSlug);
  const canWrite = !isErr(requirePermission(session.role, "payments:write"));
  const canWriteContract = !isErr(requirePermission(session.role, "contracts:write"));
  const ctx = { tenantId: session.tenantId };
  const { error, justConfirmed } = await searchParams;

  const contract = await getContractById(ctx, contractId);
  if (!contract) notFound();

  const [payer, installments, entries, paymentsList, delinquencyStats] = await Promise.all([
    getPayerById(ctx, contract.payerId),
    listInstallmentsByContract(ctx, contractId),
    listEntriesForContract(ctx, contractId),
    listPaymentsByContract(ctx, contractId),
    getPayerDelinquencyStats(ctx, contract.payerId),
  ]);
  const delinquencyBadge = computeDelinquencyBadge(delinquencyStats);

  const registerPayment = registerPaymentAction.bind(null, tenantSlug, contractId, contract.payerId);
  const cancelContract = cancelContractAction.bind(null, tenantSlug, contractId);
  const isContractActive = contract.status !== "cancelled";

  // Versão leve do §4.7.1 (DESIGN.md v6) — 3 números derivados do MESMO
  // `installments` já buscado acima pro cronograma, nenhuma query nova.
  const totalPaidCents = sum(installments.map((i) => i.paidCents));
  const owedCents = sum(
    installments
      .filter((i) => i.status !== "cancelled" && i.status !== "written_off")
      .map((i) => money(i.amountCents - i.paidCents)),
  );
  const remainingInstallments = installments.filter(
    (i) => i.status === "pending" || i.status === "partial" || i.status === "overdue",
  ).length;

  return (
    <>
      <div className="flex items-center justify-between">
        <Eyebrow>Contrato</Eyebrow>
        {canWriteContract && (
          <div className="flex gap-2">
            <Link
              href={`/t/${tenantSlug}/contracts/${contractId}/edit`}
              className={buttonClassName("secondary")}
            >
              Editar
            </Link>
            {isContractActive && (
              <form action={cancelContract}>
                <Button type="submit" variant="secondary">
                  Cancelar contrato
                </Button>
              </form>
            )}
          </div>
        )}
      </div>
      <Card>
        <p className="text-title text-content-primary">
          {payer?.name ?? "Pagador"} {!isContractActive && <ContractStatusChip status="cancelled" />}
        </p>
        <p className="mt-1 text-body text-content-secondary">{contract.description ?? "Sem descrição"}</p>
        <p className="mt-3 font-num text-metric text-content-primary tabular-nums">
          <Money value={contract.principalCents} />
        </p>
      </Card>

      <div className="flex flex-col gap-card-gap lg:flex-row">
        <div className="flex-1">
          {/* Resumo leve (DESIGN.md v6 §4.7.1) — detalhe de UMA entidade, não lista: fileira de 3 números, não o grid bento completo. */}
          <div className="flex flex-wrap gap-6 rounded-card border-hairline border-line-hairline bg-surface-card p-4 shadow-card sm:p-card-pad">
            <div>
              <span className="font-mono text-micro tracking-micro text-content-secondary uppercase">
                Saldo devedor
              </span>
              <p className="mt-1 font-num text-metric-sm text-content-primary tabular-nums">
                <Money value={owedCents} />
              </p>
            </div>
            <div>
              <span className="font-mono text-micro tracking-micro text-content-secondary uppercase">
                Total pago
              </span>
              <p className="mt-1 font-num text-metric-sm text-content-primary tabular-nums">
                <Money value={totalPaidCents} />
              </p>
            </div>
            <div>
              <span className="font-mono text-micro tracking-micro text-content-secondary uppercase">
                Parcelas restantes
              </span>
              <p className="mt-1 font-num text-metric-sm text-content-primary tabular-nums">
                {remainingInstallments}/{installments.length}
              </p>
            </div>
          </div>

          <Eyebrow>Cronograma de parcelas</Eyebrow>
          <CronogramaCards installments={installments} justConfirmed={justConfirmed === "1"} />
        </div>

        {/*
          Rail direita (DESIGN.md v6 §4.7.2) — selo de risco do pagador
          deste contrato (§7.9, mesma consulta reaproveitada do detalhe
          de pagador). "Linha do tempo de pontualidade" não construída
          pelo mesmo motivo documentado em `payers/[payerId]/page.tsx` —
          próximo passo, não bloqueio.
        */}
        {delinquencyBadge && (
          <aside className="w-full lg:w-rail lg:shrink-0">
            <Eyebrow>Selo de risco do pagador</Eyebrow>
            <div className="cartao-rail">
              <span className={delinquencyBadge.hasRisk ? "selo-tendencia-baixa" : "selo-tendencia-alta"}>
                {delinquencyBadge.label}
              </span>
            </div>
          </aside>
        )}
      </div>

      {canWrite && isContractActive && (
        <>
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
        </>
      )}

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
                    <td className="py-2">
                      <PaymentMethodChip method={payment.method} />
                    </td>
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
                      {payment.status === "applied" && canWrite && (
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
