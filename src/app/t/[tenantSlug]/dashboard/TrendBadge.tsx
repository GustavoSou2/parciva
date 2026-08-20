import { ArrowDown, ArrowUp } from "lucide-react";
import type { Trend } from "@/modules/dashboard";

/**
 * Selo de tendência — DESIGN.md v6 §7.5: sempre com período nomeado ao
 * lado, nunca um percentual solto. `trend` já vem `null` de
 * `computeTrend` quando a comparação não tem sentido (base zero,
 * estabilidade) — nesse caso o selo simplesmente não aparece, não
 * mostra "0%"/"—" (isso pareceria dado, não ausência de comparação).
 */
export function TrendBadge({ trend, period }: { trend: Trend | null; period: string }) {
  if (!trend) return null;
  const Icon = trend.direction === "up" ? ArrowUp : ArrowDown;
  const cls = trend.direction === "up" ? "selo-tendencia-alta" : "selo-tendencia-baixa";

  return (
    <span className={`inline-flex items-center gap-1 font-mono text-aux ${cls}`}>
      <Icon className="size-3" strokeWidth={1.75} />
      {trend.percent.toFixed(0)}% {period}
    </span>
  );
}
