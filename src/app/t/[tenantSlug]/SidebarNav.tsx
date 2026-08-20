"use client";

/**
 * DESIGN.md v6 §4.5 — sidebar substitui o header horizontal, 228px.
 * Item ativo: fundo `acento-soft`, texto e ícone em `acento` (ícone
 * preenchido, `fill: currentColor`) — revoga o neutro (`surface-card`/
 * `content-primary`) que essa mesma regra usava em v4/v5; a cor de ação
 * agora é sempre o acento de marca, sem exceção (§2.2).
 *
 * Entrada em stagger ao montar, mesmo padrão de `CronogramaCards`/
 * `ActivateMfaSection`: a lista de itens só existe uma vez por sessão de
 * navegação (o layout não remonta ao trocar de rota interna — só ao dar
 * F5 ou entrar de novo no `/t/<slug>`), então o efeito não repete a
 * cada clique de aba.
 *
 * Responsividade (DESIGN.md v6 §9) — `≥lg` sidebar fixa expandida com
 * rótulo (comportamento original, inalterado); `md`–`lg` colapsa para
 * rail de ícones (64px, sem rótulo, sempre visível — sem necessidade de
 * drawer, cabe sem cortar conteúdo); `<md` vira drawer fechado por
 * padrão, aberto por uma barra superior fixa com botão de menu (única
 * forma de navegar em tela de celular, já que a sidebar deixa de ocupar
 * espaço no fluxo).
 *
 * Grupos + badge de contagem (DESIGN.md v6 §4.5) — construídos nesta
 * rodada (Rodada 5). Grupos refletem a informação real do produto
 * (Principal/Operação/Conta), não uma imitação genérica do "MAIN/APPS"
 * do exemplo do DESIGN.md. Badge só em "Revisão", com `reviewQueueCount`
 * de verdade (mesma contagem do Painel) — nenhum outro item tem dado de
 * contagem real (não existe "não lido" no produto), então nenhum outro
 * ganha badge (§8: "nunca decorativo"). "Segurança" e "Sair" saíram da
 * sidebar nesta rodada — vivem no menu de usuário do `Topbar.tsx` agora
 * (§4.3), sidebar fica só com navegação de produto.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import gsap from "gsap";
import {
  ClipboardCheck,
  FileText,
  LayoutDashboard,
  Menu,
  Receipt,
  UserCog,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { usePrefersReducedMotion } from "@/ui/motion/reduced-motion";

interface NavItem {
  readonly href: string;
  readonly label: string;
  readonly icon: LucideIcon;
  readonly badge?: number;
}

interface NavGroup {
  readonly label: string;
  readonly items: readonly NavItem[];
}

function buildNavGroups(tenantSlug: string, reviewQueueCount: number): readonly NavGroup[] {
  return [
    {
      label: "Principal",
      items: [
        { href: `/t/${tenantSlug}/dashboard`, label: "Painel", icon: LayoutDashboard },
        { href: `/t/${tenantSlug}/contracts`, label: "Contratos", icon: FileText },
        { href: `/t/${tenantSlug}/payers`, label: "Pagadores", icon: Users },
      ],
    },
    {
      label: "Operação",
      items: [
        { href: `/t/${tenantSlug}/review`, label: "Revisão", icon: ClipboardCheck, badge: reviewQueueCount },
        { href: `/t/${tenantSlug}/statements`, label: "Extrato", icon: Receipt },
      ],
    },
    {
      label: "Conta",
      items: [{ href: `/t/${tenantSlug}/account`, label: "Conta", icon: UserCog }],
    },
  ];
}

export function SidebarNav({
  tenantSlug,
  reviewQueueCount,
}: {
  tenantSlug: string;
  reviewQueueCount: number;
}) {
  const pathname = usePathname();
  const listRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = usePrefersReducedMotion();
  const navGroups = buildNavGroups(tenantSlug, reviewQueueCount);
  const [mobileOpen, setMobileOpen] = useState(false);

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

  // Fecha o drawer ao trocar de rota (Link dentro do <aside> navega, mas
  // sem isso o menu ficaria aberto por cima da tela nova) e no Escape,
  // mesmo mecanismo de fechamento do Modal (`router.back()` não se aplica
  // aqui — não é uma rota interceptada, então só fecha o estado local).
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMobileOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [mobileOpen]);

  function renderNavLink({ href, label, icon: Icon, badge }: NavItem) {
    const active = pathname === href || pathname.startsWith(`${href}/`);
    return (
      <li key={href} data-nav-item>
        <Link
          href={href}
          aria-current={active ? "page" : undefined}
          title={badge ? `${label} (${badge})` : label}
          className={`flex items-center gap-2.5 rounded-control px-3 py-2 text-body transition-colors md:justify-center md:px-2 lg:justify-between lg:px-3 ${
            active
              ? "bg-accent-soft font-medium text-accent"
              : "text-content-secondary hover:bg-surface-card hover:text-content-primary"
          }`}
        >
          <span className="flex items-center gap-2.5">
            <Icon className="size-4 shrink-0" strokeWidth={1.75} fill={active ? "currentColor" : "none"} />
            <span className="md:hidden lg:inline">{label}</span>
          </span>
          {/* Badge de contagem (DESIGN.md v6 §4.5) — só com dado real por trás, nunca decorativo. */}
          {!!badge && (
            <span className="badge-contagem badge-contagem--urgente md:hidden lg:inline-flex">
              {badge > 99 ? "99+" : badge}
            </span>
          )}
        </Link>
      </li>
    );
  }

  return (
    <>
      {/* Barra móvel (<md) — a sidebar deixa de ocupar espaço no fluxo abaixo de md, então isso é a única forma de abrir a navegação. */}
      <div className="fixed inset-x-0 top-0 z-30 flex h-14 items-center justify-between border-b border-line-hairline bg-surface-panel px-card-pad md:hidden">
        <span className="text-body font-medium text-content-primary">Parciva</span>
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Abrir menu"
          aria-expanded={mobileOpen}
          className="rounded-control p-1.5 text-content-secondary hover:bg-surface-card hover:text-content-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          <Menu className="size-5" strokeWidth={1.75} />
        </button>
      </div>

      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-surface-canvas/70 backdrop-blur-sm md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/*
        DESIGN.md v6 §9 — ≥lg: fixa expandida (228px, rótulo visível).
        md–lg: rail de ícones (64px, sempre visível, sem rótulo).
        <md: drawer (`fixed`, fora do fluxo), fechado por padrão,
        deslizando por `translate-x`; instantâneo com reduced-motion.
      */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-sidebar shrink-0 flex-col border-r border-line-hairline bg-surface-panel p-card-pad md:static md:z-auto md:w-16 md:translate-x-0 md:p-3 lg:w-sidebar lg:p-card-pad ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        } ${prefersReducedMotion ? "" : "transition-transform duration-200 ease-out"}`}
      >
        <div className="flex items-center justify-between pb-6 md:justify-center lg:justify-between">
          <span className="text-body font-medium text-content-primary md:hidden lg:inline">Parciva</span>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="Fechar menu"
            className="rounded-control p-1 text-content-secondary hover:bg-surface-card hover:text-content-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 md:hidden"
          >
            <X className="size-4" strokeWidth={1.75} />
          </button>
        </div>

        <div ref={listRef} className="flex flex-1 flex-col gap-4 overflow-y-auto">
          {navGroups.map((group) => (
            <div key={group.label}>
              <span className="label-micro hidden px-3 pb-1 lg:block">{group.label}</span>
              <ul className="flex flex-col gap-1">{group.items.map(renderNavLink)}</ul>
            </div>
          ))}
        </div>
      </aside>
    </>
  );
}
