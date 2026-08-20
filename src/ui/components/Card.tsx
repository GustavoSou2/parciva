import type { ReactNode } from "react";

/**
 * Hierarquia canvas → panel → card (spec §13.1), reforçada por uma
 * sombra deliberadamente quase invisível — DESIGN.md §4: "seu trabalho
 * é ser notada só na ausência, não na presença". Sem hover próprio aqui
 * de propósito — esquentar borda no hover é comportamento de cartão
 * CLICÁVEL (ex.: `CronogramaCards.tsx`), não do primitivo genérico, que
 * também cobre cartão estático (resumo, formulário).
 */
export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-card border-hairline border-line-hairline bg-surface-card p-card-pad shadow-card ${className}`}>
      {children}
    </div>
  );
}
