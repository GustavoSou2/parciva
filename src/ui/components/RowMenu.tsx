"use client";

/**
 * Ação rápida por linha (`•••`) — DESIGN.md v6 §7.8: visível na própria
 * linha, não só clicando no card inteiro. Reusa rotas que já existem
 * (editar) — não inventa mutação nova só para preencher o menu.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MoreVertical } from "lucide-react";

export interface RowMenuAction {
  readonly label: string;
  readonly href: string;
}

export function RowMenu({ actions }: { actions: readonly RowMenuAction[] }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  if (actions.length === 0) return null;

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-label="Mais ações"
        aria-expanded={open}
        className="rounded-control p-1.5 text-content-secondary transition-colors hover:bg-surface-panel hover:text-content-primary"
      >
        <MoreVertical className="size-4" strokeWidth={1.75} />
      </button>
      {open && (
        <div className="absolute top-full right-0 z-20 mt-1 w-40 rounded-card border-hairline border-line-hairline bg-surface-card p-1 shadow-card">
          {actions.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              onClick={(e) => e.stopPropagation()}
              className="block rounded-control px-3 py-2 text-body text-content-primary hover:bg-surface-panel"
            >
              {action.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
