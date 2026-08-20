import type { InputHTMLAttributes, SelectHTMLAttributes } from "react";

/**
 * PROMPT_REFATORACAO.md §6/toques: foco visível em todo campo, com anel
 * (não só troca de cor de borda) — mas em `content-primary` (tinta), não
 * no acento: DESIGN.md §2.3 reserva o acento a "confirmação em
 * movimento" e "botão de IA", só dois papéis — um terceiro uso (foco de
 * campo) contrariaria a própria regra do documento, então a opção
 * conservadora aqui é reciclar a cor que já significa "interativo/ativo"
 * no resto do sistema.
 */
const FIELD_STYLE =
  "w-full rounded-field border-hairline border-line-hairline bg-surface-card px-3 py-2 text-body text-content-primary placeholder:text-content-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-content-primary/20 focus-visible:border-line-strong";

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${FIELD_STYLE} ${className}`} {...props} />;
}

export function Select({ className = "", ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`${FIELD_STYLE} ${className}`} {...props} />;
}
