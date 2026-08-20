/**
 * Avatar de inicial — DESIGN.md v6 §7.8: "identificador + contraparte
 * (avatar/inicial em chip)" em toda linha de entidade de negócio real.
 * Neutro de propósito (não usa `chip-1..4`, que §2.6/§7.4 reserva pra
 * categoria de transação) — aqui é só identidade visual, não categoria.
 */
export function InitialAvatar({ name }: { name: string }) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      aria-hidden="true"
      className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-panel font-mono text-aux text-content-secondary"
    >
      {initial}
    </span>
  );
}
