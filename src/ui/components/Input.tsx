import type { InputHTMLAttributes, SelectHTMLAttributes } from "react";

/**
 * Foco visível em todo campo, com anel (não só troca de cor de borda) —
 * em `acento`, DESIGN.md v6 §2.2: "anel de foco" está na lista de papéis
 * do acento "sem exceção", junto com botão primário/link/nav ativo. Isso
 * revoga a escolha conservadora de v5 (reciclar `content-primary` porque
 * o acento só tinha dois papéis então) — o acento agora tem papel amplo.
 */
const FIELD_STYLE =
  "w-full rounded-field border-hairline border-line-hairline bg-surface-card px-3 py-2 text-body text-content-primary placeholder:text-content-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:border-line-strong";

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${FIELD_STYLE} ${className}`} {...props} />;
}

export function Select({ className = "", ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`${FIELD_STYLE} ${className}`} {...props} />;
}
