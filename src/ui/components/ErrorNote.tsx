import { AlertCircle } from "lucide-react";
import type { ReactNode } from "react";

/** Erro sem cor semântica (spec §13.1) — distingue por peso de borda e posição, igual ao resto do sistema de status. Ícone herda a cor do texto ao redor (DESIGN.md §5), nunca cor própria. */
export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="flex items-start gap-2 border-l-2 border-line-strong pl-3 text-body text-content-primary">
      <AlertCircle className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
      <span>{children}</span>
    </p>
  );
}
