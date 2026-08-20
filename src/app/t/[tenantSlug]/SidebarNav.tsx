"use client";

/**
 * DESIGN.md §11 (emenda v4.1) — sidebar substitui o header horizontal;
 * o layout de 228px já estava no style-guide.md §7, só nunca tinha sido
 * construído. Ícone ativo vira preenchido (`fill: currentColor`) —
 * regra de DESIGN.md §5 que também já existia sem ter onde se aplicar.
 *
 * Entrada em stagger ao montar, mesmo padrão de `CronogramaCards`/
 * `ActivateMfaSection`: a lista de itens só existe uma vez por sessão de
 * navegação (o layout não remonta ao trocar de rota interna — só ao dar
 * F5 ou entrar de novo no `/t/<slug>`), então o efeito não repete a
 * cada clique de aba.
 */

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import gsap from "gsap";
import { ClipboardCheck, FileText, LogOut, Receipt, ShieldCheck, UserCog, Users, type LucideIcon } from "lucide-react";
import { usePrefersReducedMotion } from "@/ui/motion/reduced-motion";

interface NavItem {
  readonly href: string;
  readonly label: string;
  readonly icon: LucideIcon;
}

function buildNavItems(tenantSlug: string): readonly NavItem[] {
  return [
    { href: `/t/${tenantSlug}/contracts`, label: "Contratos", icon: FileText },
    { href: `/t/${tenantSlug}/payers`, label: "Pagadores", icon: Users },
    { href: `/t/${tenantSlug}/review`, label: "Revisão", icon: ClipboardCheck },
    { href: `/t/${tenantSlug}/statements`, label: "Extrato", icon: Receipt },
    { href: `/t/${tenantSlug}/account`, label: "Conta", icon: UserCog },
  ];
}

export function SidebarNav({
  tenantSlug,
  logoutAction,
}: {
  tenantSlug: string;
  logoutAction: () => Promise<void>;
}) {
  const pathname = usePathname();
  const listRef = useRef<HTMLUListElement>(null);
  const prefersReducedMotion = usePrefersReducedMotion();
  const navItems = buildNavItems(tenantSlug);

  useEffect(() => {
    const items = listRef.current?.querySelectorAll<HTMLElement>("[data-nav-item]");
    if (!items || items.length === 0) return;

    if (prefersReducedMotion) {
      gsap.set(items, { opacity: 1, x: 0 });
      return;
    }
    gsap.fromTo(
      items,
      { opacity: 0, x: -6 },
      { opacity: 1, x: 0, duration: 0.24, ease: "power2.out", stagger: 0.045 },
    );
  }, []);

  return (
    <aside className="flex w-sidebar shrink-0 flex-col border-r border-line-hairline bg-surface-panel p-card-pad">
      <span className="pb-6 text-body font-medium text-content-primary">Parciva</span>

      <ul ref={listRef} className="flex flex-col gap-1">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href} data-nav-item>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-2.5 rounded-control px-3 py-2 text-body transition-colors ${
                  active
                    ? "bg-surface-card font-medium text-content-primary"
                    : "text-content-secondary hover:bg-surface-card hover:text-content-primary"
                }`}
              >
                <Icon className="size-4 shrink-0" strokeWidth={1.75} fill={active ? "currentColor" : "none"} />
                {label}
              </Link>
            </li>
          );
        })}
        <li data-nav-item>
          <Link
            href="/account/security"
            aria-current={pathname === "/account/security" ? "page" : undefined}
            className={`flex items-center gap-2.5 rounded-control px-3 py-2 text-body transition-colors ${
              pathname === "/account/security"
                ? "bg-surface-card font-medium text-content-primary"
                : "text-content-secondary hover:bg-surface-card hover:text-content-primary"
            }`}
          >
            <ShieldCheck
              className="size-4 shrink-0"
              strokeWidth={1.75}
              fill={pathname === "/account/security" ? "currentColor" : "none"}
            />
            Segurança
          </Link>
        </li>
      </ul>

      <form action={logoutAction} className="mt-auto pt-4">
        <button
          type="submit"
          className="flex w-full items-center gap-2.5 rounded-control px-3 py-2 text-body text-content-secondary transition-colors hover:bg-surface-card hover:text-content-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-content-primary/20"
        >
          <LogOut className="size-4 shrink-0" strokeWidth={1.75} />
          Sair
        </button>
      </form>
    </aside>
  );
}
