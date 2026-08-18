import { requireTenantSession } from "@/app/_lib/require-tenant-session";
import { requirePermission } from "@/modules/identity";
import { getTenantBillingSummary } from "@/modules/tenant";
import { getPlanByCode, getSubscriptionByTenant, getTenantBillingCustomerRef } from "@/modules/billing";
import { money } from "@/shared/money";
import { isErr } from "@/shared/result";
import { Card } from "@/ui/components/Card";
import { Eyebrow } from "@/ui/components/Eyebrow";
import { Field } from "@/ui/components/Field";
import { Input } from "@/ui/components/Input";
import { Money } from "@/ui/components/Money";
import { Button } from "@/ui/components/Button";
import { ErrorNote } from "@/ui/components/ErrorNote";
import { subscribeAction, cancelAction } from "./actions";

// Só estes dois têm cobrança automática pela AbacatePay (decisão do
// usuário, Fase 4 parcial) — `free` nunca cobra, `scale` é negociado
// manualmente, nenhum dos dois passa por este checkout.
const BILLABLE_PLANS = [
  { code: "essential", label: "Essential" },
  { code: "professional", label: "Professional" },
] as const;

const TENANT_STATUS_LABEL: Record<string, string> = {
  trial: "Em teste",
  active: "Ativo",
  past_due: "Pagamento pendente",
  suspended: "Suspenso",
  cancelled: "Cancelado",
};

const ERROR_LABELS: Record<string, string> = {
  unauthorized: "Só o dono da conta pode alterar a cobrança.",
  invalid_billing_details: "Informe telefone e CPF/CNPJ válidos.",
  not_found: "Não foi possível identificar o usuário.",
  plan_not_found: "Plano não encontrado.",
  plan_not_billable: "Este plano não tem cobrança automática.",
  subscription_not_found: "Nenhuma assinatura ativa para cancelar.",
};

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Tela de conta (spec §13.2 tela 7, só a parte de plano — Fase 4 parcial). */
export default async function AccountPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { tenantSlug } = await params;
  const { error } = await searchParams;
  const session = await requireTenantSession(tenantSlug);

  if (isErr(requirePermission(session.role, "billing:read"))) {
    return (
      <>
        <Eyebrow>Conta</Eyebrow>
        <Card>
          <p className="text-body text-content-muted">Sem permissão para ver a cobrança deste tenant.</p>
        </Card>
      </>
    );
  }

  const canWrite = !isErr(requirePermission(session.role, "billing:write"));

  const [summary, subscription, billingCustomerRef, plans] = await Promise.all([
    getTenantBillingSummary(session.tenantId),
    getSubscriptionByTenant(session.tenantId),
    getTenantBillingCustomerRef(session.tenantId),
    Promise.all(BILLABLE_PLANS.map(async (p) => ({ ...p, plan: await getPlanByCode(p.code) }))),
  ]);

  const needsBillingDetails = !billingCustomerRef;

  return (
    <>
      <Eyebrow>Conta</Eyebrow>

      <Card className="flex flex-col gap-2">
        <p className="text-body text-content-primary">{summary?.name ?? "—"}</p>
        <p className="text-body text-content-secondary">
          Plano atual: {summary?.planCode ?? "—"} · Status:{" "}
          {summary ? TENANT_STATUS_LABEL[summary.status] ?? summary.status : "—"}
        </p>
        {subscription && (
          <p className="text-body text-content-secondary">
            Ciclo atual até {formatDate(subscription.currentPeriodEnd)}
            {subscription.cancelAt
              ? ` · cancelamento agendado para ${formatDate(subscription.cancelAt)}`
              : ""}
          </p>
        )}
      </Card>

      {error && <ErrorNote>{ERROR_LABELS[error] ?? "Não foi possível concluir a operação."}</ErrorNote>}

      {canWrite && (
        <Card className="flex flex-col gap-card-gap">
          <Eyebrow>Planos</Eyebrow>
          {needsBillingDetails && (
            <p className="text-body text-content-muted">
              Na primeira assinatura, informe o telefone e o CPF/CNPJ do responsável pela cobrança.
            </p>
          )}
          {plans.map(({ code, label, plan }) => (
            <form
              key={code}
              action={subscribeAction.bind(null, tenantSlug, code)}
              className="flex flex-col gap-2 border-t border-line-hairline pt-4 first:border-t-0 first:pt-0"
            >
              <p className="text-body text-content-primary">
                {label} {plan ? <Money value={money(plan.priceCents)} /> : "—"} / mês
              </p>
              {needsBillingDetails && (
                <div className="flex gap-2">
                  <Field label="Telefone (com DDD)">
                    <Input name="cellphone" placeholder="11999990000" required />
                  </Field>
                  <Field label="CPF/CNPJ do responsável">
                    <Input name="taxId" required />
                  </Field>
                </div>
              )}
              <Button type="submit" variant="primary" disabled={summary?.planCode === code} className="self-start">
                {summary?.planCode === code ? "Plano atual" : "Assinar"}
              </Button>
            </form>
          ))}
        </Card>
      )}

      {canWrite && subscription && !subscription.cancelAt && (
        <Card>
          <form action={cancelAction.bind(null, tenantSlug)}>
            <Button type="submit" variant="secondary">
              Cancelar assinatura
            </Button>
          </form>
        </Card>
      )}
    </>
  );
}
