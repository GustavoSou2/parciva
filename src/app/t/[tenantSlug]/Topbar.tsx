"use client";

/**
 * Topbar (DESIGN.md v6 §4.3) — fica na coluna de conteúdo, não na
 * sidebar. Dois blocos do desenho original ficaram de fora, sinalizados
 * em vez de simulados:
 *
 * - Busca ("Buscar contratos, pagadores...") — exigiria uma consulta
 *   nova de busca textual entre `contracts`/`payers` (nada disso existe
 *   hoje, `listContracts`/`listPayers` não recebem termo de busca).
 *   Construir uma busca client-side só sobre o que já está na tela
 *   mentiria sobre o que "buscar contratos, pagadores" promete (buscar
 *   TODOS, não os já carregados) — bloqueio real, não implementado.
 * - Notificação (sino) — não existe conceito de notificação/não-lido no
 *   produto hoje; um badge sem contagem real violaria a própria regra
 *   do design system (§5: "nunca decorativo"). Omitido de propósito.
 *
 * Seletor de tenant é real: `listMembershipsForUser` (identity) já
 * retorna as empresas que o usuário de fato acessa — nada simulado.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Building2, Check, ChevronDown, LogOut, Settings } from "lucide-react";

export interface TenantOption {
  readonly tenantId: string;
  readonly tenantSlug: string;
  readonly tenantName: string;
}

export function Topbar({
  memberships,
  currentTenantSlug,
  userName,
  logoutAction,
}: {
  memberships: readonly TenantOption[];
  currentTenantSlug: string;
  userName: string;
  logoutAction: () => Promise<void>;
}) {
  const [openMenu, setOpenMenu] = useState<"tenant" | "user" | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const current = memberships.find((m) => m.tenantSlug === currentTenantSlug);

  useEffect(() => {
    if (!openMenu) return;
    function onClickOutside(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpenMenu(null);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [openMenu]);

  return (
    <div
      ref={rootRef}
      className="flex h-nav items-center justify-end gap-2 border-b border-line-hairline bg-surface-canvas px-card-pad"
    >
      {/* Seletor de tenant — DESIGN.md v6 §4.3: "nunca opcional/escondido", sempre visível, nunca num menu secundário. */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpenMenu(openMenu === "tenant" ? null : "tenant")}
          className="chip-tenant"
          aria-expanded={openMenu === "tenant"}
        >
          <Building2 className="size-3.5 shrink-0 text-content-secondary" strokeWidth={1.75} />
          <span className="max-w-24 truncate text-body text-content-primary sm:max-w-none">
            {current?.tenantName ?? currentTenantSlug}
          </span>
          <ChevronDown className="size-3.5 shrink-0 text-content-secondary" strokeWidth={1.75} />
        </button>
        {openMenu === "tenant" && (
          <div className="absolute top-full right-0 z-20 mt-1 w-56 rounded-card border-hairline border-line-hairline bg-surface-card p-1 shadow-card">
            {memberships.map((m) => {
              const isCurrent = m.tenantSlug === currentTenantSlug;
              return (
                <Link
                  key={m.tenantId}
                  href={`/t/${m.tenantSlug}/dashboard`}
                  className={`flex items-center justify-between rounded-control px-3 py-2 text-body ${
                    isCurrent ? "text-accent" : "text-content-primary hover:bg-surface-panel"
                  }`}
                >
                  {m.tenantName}
                  {isCurrent && <Check className="size-3.5" strokeWidth={1.75} />}
                </Link>
              );
            })}
          </div>
        )}
      </div>

      <Link
        href="/account/security"
        title="Configurações"
        className="rounded-control p-2 text-content-secondary transition-colors hover:bg-surface-panel hover:text-content-primary"
      >
        <Settings className="size-4" strokeWidth={1.75} />
      </Link>

      <div className="relative">
        <button
          type="button"
          onClick={() => setOpenMenu(openMenu === "user" ? null : "user")}
          className="flex items-center gap-1.5 rounded-control px-2 py-1.5 text-body text-content-primary transition-colors hover:bg-surface-panel"
          aria-expanded={openMenu === "user"}
        >
          {userName}
          <ChevronDown className="size-3.5 text-content-secondary" strokeWidth={1.75} />
        </button>
        {openMenu === "user" && (
          <div className="absolute top-full right-0 z-20 mt-1 w-40 rounded-card border-hairline border-line-hairline bg-surface-card p-1 shadow-card">
            <form action={logoutAction}>
              <button
                type="submit"
                className="flex w-full items-center gap-2 rounded-control px-3 py-2 text-body text-content-secondary transition-colors hover:bg-surface-panel hover:text-content-primary"
              >
                <LogOut className="size-4 shrink-0" strokeWidth={1.75} />
                Sair
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
