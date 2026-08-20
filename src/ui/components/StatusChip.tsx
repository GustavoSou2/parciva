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
  open: { bg: "bg-state-installment-open-pastel", text: "text-state-installment-open" },
  review: { bg: "bg-state-installment-review-pastel", text: "text-state-installment-review" },
  settled: { bg: "bg-state-installment-settled-pastel", text: "text-state-installment-settled" },
  overdue: { bg: "bg-state-installment-overdue-pastel", text: "text-state-installment-overdue" },
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

/**
 * Vocabulário de estado de CONTRATO/PAGADOR — DESIGN.md v6 §2.5, lacuna
 * identificada na reescrita v6: `contracts.status`/`payers.status`
 * respondem "esse relacionamento está ativo", pergunta diferente da que
 * `StatusChip`/`STATUS` acima respondem pra parcela ("essa cobrança
 * específica está em que fase") — por isso vocabulário e tokens
 * (`state-contract-*`) próprios, nunca reaproveitando `state-installment-*`.
 *
 * Só os 2 valores que o schema de fato grava hoje (varredura confirmou
 * nenhum código escrevendo outro valor): "suspenso"/"inadimplente"
 * existem no vocabulário de cor (DESIGN.md tem os 4 tokens prontos) mas
 * não têm estado real no banco pra mapear — não inventados aqui. Se/
 * quando `contracts.status`/`payers.status` ganharem esses valores, é
 * só estender `CONTRACT_STATUS`/`PAYER_STATUS`.
 *
 * `getContractCardBg`/`getPayerCardBg` (fundo sólido do card inteiro)
 * removidos nesta rodada (DESIGN.md v6 §7.8, revisão de §2.5) — em
 * lista com múltiplos itens do mesmo estado, fundo sólido por linha
 * virava um bloco de cor uniforme sem sinalizar nada; só a pílula
 * continua. Fundo sólido de card único em destaque (fora de lista,
 * ex. cartão de parcela) continua sendo `getCardStateBg`, acima, que
 * não muda.
 */
type EntityStateGroup = "active" | "closed" | "suspended" | "delinquent";

const ENTITY_GROUP_STYLE: Record<EntityStateGroup, { bg: string; text: string }> = {
  active: { bg: "bg-state-contract-active-pastel", text: "text-state-contract-active" },
  closed: { bg: "bg-state-contract-closed-pastel", text: "text-state-contract-closed" },
  suspended: { bg: "bg-state-contract-suspended-pastel", text: "text-state-contract-suspended" },
  delinquent: { bg: "bg-state-contract-delinquent-pastel", text: "text-state-contract-delinquent" },
};

type ContractStatus = "active" | "cancelled";

const CONTRACT_STATUS: Record<ContractStatus, { label: string; group: EntityStateGroup }> = {
  active: { label: "Ativo", group: "active" },
  cancelled: { label: "Encerrado", group: "closed" },
};

export function ContractStatusChip({ status }: { status: ContractStatus }) {
  const def = CONTRACT_STATUS[status];
  const style = ENTITY_GROUP_STYLE[def.group];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-pill px-2.5 py-0.5 font-mono text-micro tracking-micro uppercase ${style.bg} ${style.text}`}
    >
      {def.label}
    </span>
  );
}

type PayerStatus = "active" | "inactive";

const PAYER_STATUS: Record<PayerStatus, { label: string; group: EntityStateGroup }> = {
  active: { label: "Ativo", group: "active" },
  inactive: { label: "Inativo", group: "closed" },
};

export function PayerStatusChip({ status }: { status: PayerStatus }) {
  const def = PAYER_STATUS[status];
  const style = ENTITY_GROUP_STYLE[def.group];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-pill px-2.5 py-0.5 font-mono text-micro tracking-micro uppercase ${style.bg} ${style.text}`}
    >
      {def.label}
    </span>
  );
}
