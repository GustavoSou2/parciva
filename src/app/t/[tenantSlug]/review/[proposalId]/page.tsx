import { notFound } from "next/navigation";
import Link from "next/link";
import { requireTenantSession } from "@/app/_lib/require-tenant-session";
import { getProposalById } from "@/modules/reconciliation";
import { getReceiptWithExtraction } from "@/modules/ingestion";
import { listFraudChecksByReceipt } from "@/modules/fraud";
import { getInstallmentById, listContractsByPayer } from "@/modules/contracts";
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
import { StatusChip } from "@/ui/components/StatusChip";
import { approveReviewAction, rejectReviewAction } from "../actions";

const ERROR_LABELS: Record<string, string> = {
  invalid_amount: "Valor do pagamento inválido.",
  proposal_not_found: "Proposta não encontrada.",
  already_reviewed: "Esta proposta já foi revisada por outra pessoa/aba.",
  contract_not_found: "Contrato não encontrado.",
  duplicate_transaction: "Já existe um pagamento com essa referência — provável duplicidade.",
  unauthorized: "Você não tem permissão para aprovar ou rejeitar comprovantes.",
};

// `auto_applied` fica de fora de propósito: só pode chegar aqui por link
// direto/histórico (a lista só lista `needs_review`), e "Aprovado na
// revisão" seria falso para uma decisão que o motor tomou sozinho.
const DECISION_STATUS: Partial<Record<string, "review" | "rejected" | "reviewed_approved">> = {
  needs_review: "review",
  rejected: "rejected",
  reviewed_approved: "reviewed_approved",
};

const CHECK_LABELS: Record<string, string> = {
  amount_match: "Valor bate com o esperado",
  date_plausible: "Data plausível",
  e2e_reuse: "Referência de transação não reutilizada",
};

/** "1500,00" — sem separador de milhar, formato que `fromReais` aceita de volta (ver src/shared/money.ts). */
function centsToPlainReais(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

export default async function ReviewDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string; proposalId: string }>;
  searchParams: Promise<{ error?: string; payerId?: string }>;
}) {
  const { tenantSlug, proposalId } = await params;
  const { error, payerId: payerIdParam } = await searchParams;
  const session = await requireTenantSession(tenantSlug);
  const canApprove = !isErr(requirePermission(session.role, "receipts:approve"));
  const ctx = { tenantId: session.tenantId };

  const proposal = await getProposalById(ctx, proposalId);
  if (!proposal) notFound();

  const receipt = await getReceiptWithExtraction(ctx, proposal.receiptId);
  const extraction = receipt?.extraction ?? null;
  const fraudChecks = await listFraudChecksByReceipt(ctx, proposal.receiptId);

  // O motor já tinha achado um alvo (revisão por confiança/teto/data, não
  // por falta de pagador/contrato) — `proposedAllocations` só guarda
  // `installmentId`, então resolvemos contrato/pagador a partir dele.
  const firstAllocation = proposal.proposedAllocations[0];
  const resolvedInstallment = firstAllocation
    ? await getInstallmentById(ctx, firstAllocation.installmentId)
    : null;

  const payerId = resolvedInstallment?.payerId ?? payerIdParam ?? null;
  const [contracts, payers] = await Promise.all([
    payerId ? listContractsByPayer(ctx, payerId) : Promise.resolve([]),
    payerId ? Promise.resolve([]) : listPayers(ctx),
  ]);

  const isPending = proposal.decision === "needs_review";
  const decisionStatus = DECISION_STATUS[proposal.decision];
  const approve = approveReviewAction.bind(null, tenantSlug, proposalId, proposal.receiptId);
  const reject = rejectReviewAction.bind(null, tenantSlug, proposalId, proposal.receiptId);

  return (
    <>
      <Eyebrow>Revisão de comprovante</Eyebrow>

      <div className="grid grid-cols-1 gap-card-gap md:grid-cols-2">
        <Card>
          <p className="mb-3 text-body font-medium text-content-primary">Comprovante</p>
          {!receipt ? (
            <p className="text-body text-content-muted">Arquivo não encontrado.</p>
          ) : receipt.mimeType.startsWith("image/") ? (
            <img
              src={`/t/${tenantSlug}/receipts/${receipt.id}/file`}
              alt="Comprovante enviado"
              className="max-h-96 w-full rounded-field object-contain"
            />
          ) : (
            <a
              href={`/t/${tenantSlug}/receipts/${receipt.id}/file`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-content-primary hover:underline"
            >
              Abrir comprovante (PDF)
            </a>
          )}
        </Card>

        <Card>
          <p className="mb-3 text-body font-medium text-content-primary">Dados extraídos</p>
          {!extraction ? (
            <p className="text-body text-content-muted">Sem extração registrada.</p>
          ) : (
            <>
              {/*
                DESIGN.md §1.5 item 1 — o valor é o número que decide a
                aprovação/rejeição desta tela; domina visualmente sobre o
                resto do metadado, em vez de ser mais uma linha do dl.
              */}
              <p className="mb-1 font-mono text-micro tracking-micro text-content-secondary uppercase">Valor</p>
              <p className="mb-4 font-num text-metric text-content-primary tabular-nums">
                {extraction.amount_cents != null ? <Money value={extraction.amount_cents} /> : "—"}
              </p>
              <dl className="flex flex-col gap-2 text-body">
              <div className="flex justify-between">
                <dt className="text-content-secondary">Data paga</dt>
                <dd>{extraction.paid_at?.slice(0, 10) ?? "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-content-secondary">Referência (E2E ID)</dt>
                <dd>{extraction.transaction_ref ?? "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-content-secondary">Pagador</dt>
                <dd>{extraction.payer_name ?? "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-content-secondary">Documento (mascarado)</dt>
                <dd>{extraction.payer_document_masked ?? "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-content-secondary">Instituição</dt>
                <dd>{extraction.institution ?? "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-content-secondary">Confiança</dt>
                <dd className="font-num tabular-nums">{(extraction.confidence * 100).toFixed(0)}%</dd>
              </div>
              {extraction.anomalies.length > 0 && (
                <div>
                  <dt className="text-content-secondary">Anomalias</dt>
                  <dd>
                    <ul className="list-inside list-disc">
                      {extraction.anomalies.map((anomaly) => (
                        <li key={anomaly}>{anomaly}</li>
                      ))}
                    </ul>
                  </dd>
                </div>
              )}
              </dl>
            </>
          )}
        </Card>
      </div>

      {fraudChecks.length > 0 && (
        <Card>
          <p className="mb-3 text-body font-medium text-content-primary">
            Checagens de fraude
            {proposal.riskScore != null && (
              <span className="ml-2 font-num text-content-secondary tabular-nums">
                (risco {proposal.riskScore.toFixed(0)}/100)
              </span>
            )}
          </p>
          <dl className="flex flex-col gap-2 text-body">
            {fraudChecks.map((check) => (
              <div key={check.code} className="flex justify-between">
                <dt className="text-content-secondary">{CHECK_LABELS[check.code] ?? check.code}</dt>
                <dd className={check.result === "pass" ? "text-content-secondary" : "text-content-primary"}>
                  {check.result === "pass" ? "Passou" : check.result === "warn" ? "Atenção" : "Falhou"}
                </dd>
              </div>
            ))}
          </dl>
        </Card>
      )}

      {!isPending ? (
        <Card>
          <p className="text-body text-content-primary">
            Esta proposta já foi revisada — decisão:{" "}
            {decisionStatus ? <StatusChip status={decisionStatus} /> : proposal.decision}
          </p>
        </Card>
      ) : !canApprove ? (
        <Card>
          <p className="text-body text-content-muted">
            Sem permissão para aprovar ou rejeitar comprovantes deste tenant.
          </p>
        </Card>
      ) : (
        <>
          <Eyebrow>Aplicar pagamento</Eyebrow>
          <Card>
            {!payerId ? (
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
                <Link href={`/t/${tenantSlug}/review/${proposalId}`} className="text-content-primary hover:underline">
                  Escolher outro pagador
                </Link>
                .
              </p>
            ) : (
              <form action={approve} className="flex flex-col gap-card-gap">
                <input type="hidden" name="payerId" value={payerId} />
                <Field label="Contrato">
                  <Select name="contractId" required defaultValue={resolvedInstallment?.contractId ?? ""}>
                    {contracts.map((contract) => (
                      <option key={contract.id} value={contract.id}>
                        {contract.description ?? contract.id}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Valor (R$)">
                  <Input
                    name="amount"
                    required
                    defaultValue={extraction?.amount_cents != null ? centsToPlainReais(extraction.amount_cents) : ""}
                  />
                </Field>
                <Field label="Data do pagamento">
                  <Input name="paidAt" type="date" defaultValue={extraction?.paid_at?.slice(0, 10) ?? ""} />
                </Field>
                <Field label="Forma">
                  <Select
                    name="method"
                    defaultValue={
                      extraction?.method && extraction.method !== "unknown" ? extraction.method : "pix"
                    }
                  >
                    <option value="pix">PIX</option>
                    <option value="ted">TED</option>
                    <option value="boleto">Boleto</option>
                    <option value="cash">Dinheiro</option>
                    <option value="card">Cartão</option>
                    <option value="other">Outro</option>
                  </Select>
                </Field>
                <Field label="Referência da transação (opcional)">
                  <Input name="transactionRef" defaultValue={extraction?.transaction_ref ?? ""} />
                </Field>
                {error && <ErrorNote>{ERROR_LABELS[error] ?? "Não foi possível aplicar o pagamento."}</ErrorNote>}
                <Button type="submit" className="self-start">
                  Aprovar e aplicar pagamento
                </Button>
              </form>
            )}
          </Card>

          <Card>
            <form action={reject} className="flex flex-col gap-card-gap">
              <Field label="Motivo da rejeição (opcional)">
                <Input name="reviewNote" />
              </Field>
              <Button type="submit" variant="secondary" className="self-start">
                Rejeitar
              </Button>
            </form>
          </Card>
        </>
      )}
    </>
  );
}
