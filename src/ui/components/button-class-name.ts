/**
 * Extraída de Button.tsx: aquele arquivo tem "use client" (por causa do
 * `motion.button`), e no App Router toda exportação de um módulo "use
 * client" vira referência de client component na fronteira RSC — mesmo
 * uma função pura sem JSX. Isso impede páginas server component (as
 * telas de contrato/pagador) de chamar `buttonClassName()` diretamente.
 * Vive num módulo sem diretiva pra poder ser importada dos dois lados.
 */
export type ButtonVariant = "primary" | "secondary";

/**
 * Exportada separada do componente porque `<a>` (ex.: `next/link`) não
 * pode conter `<button>` como descendente (HTML inválido) — telas que
 * precisam de um link com cara de botão (ex.: "Novo pagador") aplicam
 * esta classe direto no `Link`, em vez de aninhar `<Button>` dentro dele.
 */
export function buttonClassName(variant: ButtonVariant = "primary", className = ""): string {
  const base =
    "inline-block rounded-control px-4 py-2 text-body font-medium transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-content-primary/20 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-canvas disabled:cursor-not-allowed disabled:opacity-50";
  const styles =
    variant === "primary"
      ? "bg-surface-inverse text-content-on-inverse hover:opacity-90"
      : "border-hairline border-line-hairline bg-surface-card text-content-primary hover:bg-surface-panel";
  return `${base} ${styles} ${className}`;
}
