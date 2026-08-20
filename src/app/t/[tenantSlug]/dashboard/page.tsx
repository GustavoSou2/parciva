import Link from "next/link";
import { CalendarClock, ClipboardCheck, TriangleAlert } from "lucide-react";
import { requireTenantSession } from "@/app/_lib/require-tenant-session";
import { getDashboardSummary, computeTrend } from "@/modules/dashboard";
import { getUserById } from "@/modules/identity";
import { Eyebrow } from "@/ui/components/Eyebrow";
import { Money } from "@/ui/components/Money";
import { AutomationGauge } from "./AutomationGauge";
import { Sparkline } from "./Sparkline";
import { TrendBadge } from "./TrendBadge";

/** Único fuso real do produto hoje (100% dos tenants nascem com `timezone: "America/Sao_Paulo"`, sem UI pra trocar) — evita uma query nova só pra ler `tenants.timezone` pra uma saudação. Se isso deixar de ser verdade, vira bloqueio real, não decoração. */
const GREETING_TIMEZONE = "America/Sao_Paulo";

/** Hero de abertura (DESIGN.md v6 §4.1) — só na tela de entrada do produto, varia por horário real do relógio, nunca decorativo. */
function greetingWord(): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: GREETING_TIMEZONE,
      hour: "numeric",
      hourCycle: "h23",
    }).format(new Date()),
  );
  if (hour < 5) return "Boa noite";
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

/**
 * Painel (spec `docs/quitou-spec.md` §13.2 tela 1) — v6 "Confiança Viva".
 *
 * - Hero de saudação (§4.1) — só aqui, ponto de entrada do produto.
 * - Grid bento assimétrico (§4.7), 5 cards, 2 fileiras — "Recebido hoje"
 *   (col-span-7, com sparkline+tendência) e "Valor em risco" (§7.9,
 *   col-span-5, versão simples: soma de parcelas vencidas agora — a
 *   versão completa, "pagador historicamente inadimplente", é próximo
 *   passo, ver CHANGELOG) dominam a primeira fileira; "A receber"/
 *   "Fila de revisão"/"Taxa de automação" dividem a segunda em partes
 *   iguais — nunca todos os 5 do mesmo tamanho (§8).
 * - Selo de tendência (§7.5) em "Recebido hoje" (vs. ontem) e "Taxa de
 *   automação" (vs. semana anterior) — os dois únicos KPIs com
 *   comparação temporal que faz sentido semântico; "A receber"/"Fila de
 *   revisão"/"Valor em risco" não ganharam selo por não terem uma
 *   "tendência vs. período anterior" limpa (janela futura, fila ao
 *   vivo, e valor em risco é o quanto já venceu agora — comparar com
 *   "quanto estava vencido ontem" mudaria conforme parcelas são pagas
 *   OU vencem no meio do dia, não é uma tendência estável o bastante
 *   pra rotular com confiança).
 * - CTA de upsell (§4.2): não construído — a tela já tem um spotlight
 *   ("Fila de revisão") ocupando o único slot de destaque permitido
 *   por tela (§4.2/§7.2 proíbem os dois juntos); o upgrade de plano já
 *   tem um caminho real em `/account`, fora desse slot.
 * - Gráfico de fluxo previsto×realizado e projeção 30/60/90 dias
 *   (§7.9): não construídos — nenhum gráfico existia nesta tela antes
 *   dela mesma existir, e a projeção precisaria de "valor esperado
 *   histórico" que não é uma leitura de uma tabela só; reportado como
 *   bloqueio/próximo passo, não inventado.
 * - Rail "lista vencendo essa semana" (§4.7.2, tabela da Rodada 6): já
 *   é a rail "Próximas parcelas" existente — mesmo widget, não duplicado.
 */
export default async function DashboardPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const session = await requireTenantSession(tenantSlug);
  const [summary, user] = await Promise.all([
    getDashboardSummary({ tenantId: session.tenantId }),
    getUserById(session.userId),
  ]);

  const receivedTrend = computeTrend(summary.receivedTodayCents, summary.receivedYesterdayCents);
  const automationTrend =
    summary.automationRateCurrentWindow != null && summary.automationRatePreviousWindow != null
      ? computeTrend(summary.automationRateCurrentWindow, summary.automationRatePreviousWindow)
      : null;
  const sparklineValues = summary.receivedDailySeries.map((d) => d.totalCents);

  return (
    <>
      {/*
        Composição de fundo sutil (DESIGN.md v6 §4.6) — só aqui, atrás
        do hero: nunca atrás dos cards do bento abaixo (cada card tem
        `bg-surface-card` opaco, que já cobre qualquer vazamento do blur
        por baixo — mesma técnica das telas de autenticação).
      */}
      <div className="relative overflow-hidden">
        <div
          className="composicao-blob -top-10 -left-10 size-48 rounded-full bg-data-2-soft"
          aria-hidden="true"
        />
        <p className="text-title font-medium text-content-primary">
          {greetingWord()}
          {user ? `, ${user.name.split(" ")[0]}` : ""}
        </p>
        <p className="text-body text-content-secondary">Acompanhe seus contratos e receba mais rápido.</p>
      </div>

      <div className="flex flex-col gap-card-gap lg:flex-row">
        {/*
          Grid bento (DESIGN.md v6 §4.7) — 12 colunas em desktop, `col-span`
          padrão do Tailwind (sem `col-start`/`row-span` desta vez — 2
          fileiras de spans que já somam 12 cada, o próprio auto-flow do
          grid quebra a linha certa). Ordem no DOM é a ordem de
          importância (dominante → risco → apoio → apoio → gauge) — em
          mobile (grid-cols-1) isso garante "hero sempre primeiro" sem
          depender de `order-*`.
        */}
        <div className="grid flex-1 grid-cols-1 gap-card-gap md:grid-cols-6 lg:grid-cols-12">
          <div className="col-span-1 flex flex-col justify-between rounded-card border-hairline border-line-hairline bg-surface-card p-4 shadow-card sm:p-card-pad md:col-span-4 lg:col-span-7">
            <div>
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-mono text-micro tracking-micro text-content-secondary uppercase">
                  Recebido hoje
                </span>
                <TrendBadge trend={receivedTrend} period="vs. ontem" />
              </div>
              <p className="mt-2 font-num text-display text-content-primary tabular-nums">
                <Money value={summary.receivedTodayCents} />
              </p>
            </div>
            <div className="mt-4">
              <Sparkline values={sparklineValues} />
            </div>
          </div>

          {/* "Valor em risco" (DESIGN.md v6 §7.9) — cor `tendencia-baixa` no número (é projeção agregada, não estado de uma entidade), sempre com a composição ao lado. */}
          <div className="col-span-1 flex flex-col justify-between rounded-card border-hairline border-line-hairline bg-surface-card p-4 shadow-card sm:p-card-pad md:col-span-2 lg:col-span-5">
            <span className="flex items-center gap-1.5 font-mono text-micro tracking-micro text-content-secondary uppercase">
              <TriangleAlert className="selo-tendencia-baixa size-3.5" strokeWidth={1.75} />
              Valor em risco
            </span>
            <p className="selo-tendencia-baixa mt-2 font-num text-display tabular-nums">
              <Money value={summary.atRisk.amountCents} />
            </p>
            <p className="mt-1 font-mono text-aux text-content-muted">
              {summary.atRisk.contractsCount} contrato{summary.atRisk.contractsCount === 1 ? "" : "s"},{" "}
              {summary.atRisk.payersCount} pagador{summary.atRisk.payersCount === 1 ? "" : "es"}
            </p>
          </div>

          <div className="col-span-1 rounded-card border-hairline border-line-hairline bg-surface-card p-4 shadow-card sm:p-card-pad md:col-span-2 lg:col-span-4">
            <span className="font-mono text-micro tracking-micro text-content-secondary uppercase">
              A receber (7 dias)
            </span>
            <p className="mt-2 font-num text-metric text-content-primary tabular-nums">
              <Money value={summary.upcoming7DaysCents} />
            </p>
          </div>

          {/*
            Cartão spotlight (DESIGN.md v6 §7.2) — confirmação: o card
            "Fila de revisão" não é saldo/dívida, é métrica de
            atividade (quantos comprovantes esperam decisão humana
            agora). Único spotlight/cta desta tela — regra de "no
            máximo um por tela" (§7.2/§4.2/§8).
          */}
          <Link
            href={`/t/${tenantSlug}/review`}
            className="cartao-spotlight col-span-1 flex flex-col p-4 transition-transform duration-150 hover:-translate-y-0.5 sm:p-card-pad md:col-span-2 lg:col-span-4"
          >
            <span className="flex items-center gap-1.5 font-mono text-micro tracking-micro uppercase opacity-80">
              <ClipboardCheck className="size-3.5" strokeWidth={1.75} />
              Fila de revisão
            </span>
            <p className="mt-2 font-num text-metric tabular-nums">{summary.reviewQueueCount}</p>
          </Link>

          <div className="col-span-1 flex flex-col items-center justify-center gap-2 rounded-card border-hairline border-line-hairline bg-surface-card p-4 text-center shadow-card sm:p-card-pad md:col-span-2 lg:col-span-4">
            <span className="font-mono text-micro tracking-micro text-content-secondary uppercase">
              Taxa de automação
            </span>
            <AutomationGauge rate={summary.automationRate} />
            <TrendBadge trend={automationTrend} period="vs. semana anterior" />
          </div>
        </div>

        {/*
          Rail direita (DESIGN.md v6 §10, estrutura do Finixra adotada
          sem ressalva) — "próximas parcelas", `.cartao-rail` (raio 14px,
          um degrau abaixo do cartão principal). Responsividade §9: some
          da coluna própria e desce para abaixo do conteúdo central em
          telas < lg, nunca escondida.
        */}
        <aside className="flex w-full flex-col gap-2 lg:w-rail lg:shrink-0">
          <Eyebrow>Próximas parcelas</Eyebrow>
          {summary.upcomingInstallments.length === 0 ? (
            <div className="cartao-rail">
              <p className="text-body text-content-muted">Nenhuma parcela vencendo nos próximos 7 dias.</p>
            </div>
          ) : (
            summary.upcomingInstallments.map((item) => (
              <Link
                key={item.installmentId}
                href={`/t/${tenantSlug}/contracts/${item.contractId}`}
                className="cartao-rail flex items-center justify-between gap-3 transition-colors duration-150 hover:border-line-strong"
              >
                <div className="flex items-center gap-2.5 overflow-hidden">
                  <CalendarClock className="size-4 shrink-0 text-content-secondary" strokeWidth={1.75} />
                  <div className="overflow-hidden">
                    <p className="truncate text-body text-content-primary">{item.payerName}</p>
                    <p className="font-mono text-aux text-content-muted">Vence {item.dueDate}</p>
                  </div>
                </div>
                <span className="shrink-0 font-num text-body text-content-primary tabular-nums">
                  <Money value={item.amountCents} />
                </span>
              </Link>
            ))
          )}
        </aside>
      </div>
    </>
  );
}
