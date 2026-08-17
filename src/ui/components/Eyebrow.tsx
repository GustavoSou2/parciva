import type { ReactNode } from "react";

/** Rótulo micro — spec §13.1: escala binária, sem tamanho intermediário em título. */
export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <span className="text-micro tracking-micro text-content-secondary uppercase">{children}</span>
  );
}
