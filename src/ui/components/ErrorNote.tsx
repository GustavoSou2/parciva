import type { ReactNode } from "react";

/** Erro sem cor semântica (spec §13.1) — distingue por peso de borda e posição, igual ao resto do sistema de status. */
export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="border-l-2 border-line-strong pl-3 text-body text-content-primary">
      {children}
    </p>
  );
}
