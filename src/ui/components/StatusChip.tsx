/**
 * Status sem cor semântica — spec §13.1: "não existe verde-positivo /
 * vermelho-negativo". Cada estado se diferencia por rótulo, peso de
 * borda (hairline vs strong) e decoração de texto, nunca por matiz.
 * "Vencido" usa a mesma borda de "Confirmado" de propósito — a spec
 * distingue esse estado por posição na tela (agrupado no topo), não
 * pelo chip; não invente cor aqui para compensar isso.
 *
 * "review" aproxima a "hachura diagonal" da spec com opacity.hatch
 * (0.35) sobre um fundo neutro — um verdadeiro padrão diagonal exigiria
 * background-image, que não é um token e violaria no-arbitrary-value.
 */
const STATUS = {
  confirmed: { label: "Confirmado", style: "border-line-strong text-content-primary" },
  document: { label: "Comprovante conferido", style: "border-line-hairline text-content-primary" },
  review: {
    label: "Em revisão",
    style: "border-line-hairline bg-surface-panel opacity-hatch text-content-primary",
  },
  rejected: { label: "Rejeitado", style: "border-line-strong line-through text-content-primary" },
  overdue: { label: "Vencido", style: "border-line-strong text-content-primary" },
  unverified: { label: "Registrado manualmente", style: "border-line-hairline text-content-muted" },
  // `installments.status` (spec §5.2) — Marco 3. Mesma disciplina: sem
  // cor, só peso de borda/decoração. "overdue" acima já cobre parcela
  // vencida — não duplicar aqui.
  paid: { label: "Quitada", style: "border-line-strong text-content-primary" },
  pending: { label: "A vencer", style: "border-line-hairline text-content-muted" },
  partial: {
    label: "Parcial",
    style: "border-line-hairline bg-surface-panel opacity-hatch text-content-primary",
  },
  cancelled: { label: "Cancelada", style: "border-line-hairline line-through text-content-muted" },
  written_off: { label: "Baixa por perda", style: "border-line-strong line-through text-content-primary" },
  // `payments.status === "reversed"` — rótulo próprio, nunca reusar
  // "Rejeitado" (spec §13.3: nomear pelo que a pessoa controla, com
  // precisão — estorno não é a mesma coisa que rejeição).
  reversed: { label: "Estornado", style: "border-line-strong line-through text-content-primary" },
} as const;

export function StatusChip({ status }: { status: keyof typeof STATUS }) {
  const s = STATUS[status];
  return (
    <span
      className={`inline-block rounded-chip border-hairline px-2 py-0.5 text-micro tracking-micro uppercase ${s.style}`}
    >
      {s.label}
    </span>
  );
}
