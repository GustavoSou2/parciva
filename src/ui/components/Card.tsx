import type { ReactNode } from "react";

/**
 * Hierarquia sem sombra — spec §13.1: canvas → panel → card, nunca
 * elevação. `shadow-none` é o único valor que boxShadow expõe no tema
 * (setup.md Parte 7.2) — deixamos explícito para travar a intenção, não
 * por necessidade técnica (não há shadow-md para escolher por engano).
 */
export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-card border-hairline border-line-hairline bg-surface-card p-card-pad shadow-none ${className}`}
    >
      {children}
    </div>
  );
}
