import type { ReactNode } from "react";

/**
 * Rótulo micro — spec §13.1: escala binária, sem tamanho intermediário
 * em título. `font-mono` (Geist Mono) — DESIGN.md §3: rótulo é "voz de
 * máquina", mesmo tratamento já usado na pílula de status.
 */
export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <span className="font-mono text-micro tracking-micro text-content-secondary uppercase">
      {children}
    </span>
  );
}
