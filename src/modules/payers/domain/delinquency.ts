/**
 * Selo de risco por pagador — DESIGN.md v6 §7.9: estatística simples e
 * visível ("atrasou 3 de 8"), nunca score sem composição ao lado. Sem
 * I/O — recebe as contagens já calculadas por `payer-risk-repository.ts`.
 */
export interface PayerDelinquencySummary {
  readonly dueInstallments: number;
  readonly overdueInstallments: number;
}

export interface DelinquencyBadge {
  readonly label: string;
  /** `true` = usa `tendencia-baixa` (tem atraso); `false` = `tendencia-alta` (recorde limpo). */
  readonly hasRisk: boolean;
}

/** `null` quando o pagador nunca teve parcela vencida ainda — "0 de 0" não é um recorde bom, é ausência de histórico, não deveria ler como selo positivo. */
export function computeDelinquencyBadge(stats: PayerDelinquencySummary): DelinquencyBadge | null {
  if (stats.dueInstallments === 0) return null;
  return {
    label: `atrasou ${stats.overdueInstallments} de ${stats.dueInstallments}`,
    hasRisk: stats.overdueInstallments > 0,
  };
}
