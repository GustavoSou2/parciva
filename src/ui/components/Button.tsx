import type { ButtonHTMLAttributes } from "react";

/**
 * Spec §13.1: menta é reservado a dot de seção, badge de variação e
 * botão da IA — nunca cor de botão primário genérico. Botão "primary"
 * aqui usa `surface.inverse`/`content.on-inverse` (preto sólido, texto
 * branco), não menta.
 */
type ButtonVariant = "primary" | "secondary";

/**
 * Exportada separada do componente porque `<a>` (ex.: `next/link`) não
 * pode conter `<button>` como descendente (HTML inválido) — telas que
 * precisam de um link com cara de botão (ex.: "Novo pagador") aplicam
 * esta classe direto no `Link`, em vez de aninhar `<Button>` dentro dele.
 */
export function buttonClassName(variant: ButtonVariant = "primary", className = ""): string {
  const base =
    "inline-block rounded-control px-4 py-2 text-body font-medium transition-opacity disabled:cursor-not-allowed disabled:opacity-50";
  const styles =
    variant === "primary"
      ? "bg-surface-inverse text-content-on-inverse hover:opacity-90"
      : "border-hairline border-line-hairline bg-surface-card text-content-primary hover:bg-surface-panel";
  return `${base} ${styles} ${className}`;
}

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return <button className={buttonClassName(variant, className)} {...props} />;
}
