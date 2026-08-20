import { AlertTriangle, CheckCircle2, type LucideIcon } from "lucide-react";

/**
 * DESIGN.md §2.2/§7 — pastel de estado, NOMEADO PELO PROCESSO (não
 * bom/ruim genérico), substitui a disciplina anterior de "só peso de
 * borda, nunca cor" (spec §13.1). Continua verdadeiro o espírito da
 * regra antiga: não existe verde-positivo/vermelho-negativo arbitrário
 * — "vencido" é urgência de ação, não culpa do cliente; as 4 cores são
 * nomeadas por ESTADO, e o pastel some se o dinheiro nunca chegou a
 * acontecer (grupo "aberto" fica neutro). Ver DECISIONS.md pela mudança
 * completa e por que ela é deliberada, não um esquecimento da regra
 * antiga.
 *
 * Os 14 status reais do produto mapeiam pros 4 estados do DESIGN.md:
 * - liquidado: pago/confirmado de verdade
 * - aberto (neutro, sem pastel): ainda não aconteceu nada de definitivo
 * - análise: em conferência (humana ou parcial)
 * - atraso: aconteceu algo que precisa de atenção — vencido é urgência
 *   de prazo; rejeitado/cancelado/baixado/estornado são "deixou de
 *   valer" (por isso mantêm o `line-through` herdado da disciplina
 *   antiga — precisão de "o que aconteceu", spec §13.3 — mesmo
 *   compartilhando o pastel de atraso).
 */
type StateGroup = "open" | "review" | "settled" | "overdue";

const GROUP_STYLE: Record<StateGroup, { bg: string; text: string }> = {
  open: { bg: "bg-state-open-pastel", text: "text-state-open" },
  review: { bg: "bg-state-review-pastel", text: "text-state-review" },
  settled: { bg: "bg-state-settled-pastel", text: "text-state-settled" },
  overdue: { bg: "bg-state-overdue-pastel", text: "text-state-overdue" },
};

const GROUP_ICON: Partial<Record<StateGroup, LucideIcon>> = {
  settled: CheckCircle2,
  overdue: AlertTriangle,
};

interface StatusDef {
  readonly label: string;
  readonly group: StateGroup;
  readonly voided?: boolean; // line-through — "deixou de valer", não "está vencendo"
}

const STATUS = {
  confirmed: { label: "Confirmado", group: "settled" },
  document: { label: "Comprovante conferido", group: "open" },
  review: { label: "Em revisão", group: "review" },
  rejected: { label: "Rejeitado", group: "overdue", voided: true },
  overdue: { label: "Vencido", group: "overdue" },
  unverified: { label: "Registrado manualmente", group: "open" },
  // `installments.status` (spec §5.2) — Marco 3.
  paid: { label: "Quitada", group: "settled" },
  pending: { label: "A vencer", group: "open" },
  partial: { label: "Parcial", group: "review" },
  cancelled: { label: "Cancelada", group: "overdue", voided: true },
  written_off: { label: "Baixa por perda", group: "overdue", voided: true },
  // `payments.status === "reversed"` — rótulo próprio, nunca reusa "Rejeitado"
  // (spec §13.3: nomear pelo que a pessoa controla, com precisão).
  reversed: { label: "Estornado", group: "overdue", voided: true },
  // `reconciliation_proposals.decision === "reviewed_approved"` (Marco 5) —
  // nunca reusa "Confirmado" (decisão [5]: reservado a psp_confirmed).
  reviewed_approved: { label: "Aprovado na revisão", group: "settled" },
  // `payers.status === "inactive"` — desativado não é "erro", é estado administrativo.
  inactive: { label: "Inativo", group: "open" },
  // `contracts.status` — "active" é o estado padrão de todo contrato em andamento.
  active: { label: "Ativo", group: "open" },
} as const satisfies Record<string, StatusDef>;

/** Reusado por `CronogramaCards.tsx` pra colorir a régua-resumo com o mesmo agrupamento da pílula — nunca reinventar o mapeamento em outro lugar. */
export function getStatusGroup(status: keyof typeof STATUS): StateGroup {
  return STATUS[status].group;
}

/**
 * DESIGN.md §12 (emenda v4.1) — pastel de estado como fundo do cartão
 * inteiro, não só da pílula. "Aberto" usa `surface-card` (branco) em vez
 * do pastel de §2.2 (que É a cor do canvas) — um cartão branco sobre
 * canvas cinza continua visível; um cartão "pastel aberto" se
 * confundiria com o fundo atrás dele.
 */
export function getCardStateBg(status: keyof typeof STATUS): string {
  const group = STATUS[status].group;
  return group === "open" ? "bg-surface-card" : GROUP_STYLE[group].bg;
}

export function StatusChip({ status }: { status: keyof typeof STATUS }) {
  const def: StatusDef = STATUS[status];
  const style = GROUP_STYLE[def.group];
  const Icon = GROUP_ICON[def.group];

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-pill px-2.5 py-0.5 font-mono text-micro tracking-micro uppercase ${style.bg} ${style.text} ${def.voided ? "line-through" : ""}`}
    >
      {Icon && <Icon className="size-3" strokeWidth={1.75} />}
      {def.label}
    </span>
  );
}
