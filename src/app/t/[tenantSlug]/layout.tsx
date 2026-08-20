import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireTenantSession } from "@/app/_lib/require-tenant-session";
import { deleteSession, getUserById, listMembershipsForUser, logout } from "@/modules/identity";
import { countProposalsByDecision } from "@/modules/reconciliation";
import { CSRF_COOKIE_NAME, SESSION_COOKIE_NAME } from "@/shared/session-cookie";
import { SidebarNav } from "./SidebarNav";
import { Topbar } from "./Topbar";

async function logoutAction(): Promise<void> {
  "use server";
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (token) {
    await logout(token, { deleteSession });
  }
  cookieStore.delete(SESSION_COOKIE_NAME);
  cookieStore.delete(CSRF_COOKIE_NAME);
  redirect("/login");
}

/**
 * Sidebar (DESIGN.md v6 §4.5) substitui o header horizontal — não a
 * navegação completa da spec §13.2 (7 telas: Painel,
 * Fila de revisão, Contratos, Pagadores, Comprovantes, Configurações,
 * Conta). Só Contratos/Pagadores/Revisão/Extrato/Conta existem até este
 * marco (Conta ainda só cobre plano/cobrança, não configurações; Extrato
 * é a conciliação por extrato da Fase 5).
 *
 * `modal` é o slot paralelo `@modal` (PROMPT_REFATORACAO.md §3.5) — rotas
 * de formulário interceptadas (`@modal/(.)contracts/new` etc.) renderizam
 * aqui por cima de `children`, sem substituir a página de baixo.
 */
export default async function TenantLayout({
  children,
  modal,
  params,
}: {
  children: ReactNode;
  modal: ReactNode;
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const session = await requireTenantSession(tenantSlug);

  const [reviewQueueCount, memberships, user] = await Promise.all([
    countProposalsByDecision({ tenantId: session.tenantId }, "needs_review"),
    listMembershipsForUser(session.userId),
    getUserById(session.userId),
  ]);

  return (
    <div className="flex min-h-screen bg-surface-canvas">
      <SidebarNav tenantSlug={tenantSlug} reviewQueueCount={reviewQueueCount} />
      {/* `pt-14` libera espaço pra barra fixa do menu móvel (SidebarNav, <md) — some a partir de md, quando a sidebar volta a ocupar espaço no fluxo em vez de flutuar por cima. */}
      <div className="flex flex-1 flex-col pt-14 md:pt-0">
        <Topbar
          memberships={memberships}
          currentTenantSlug={tenantSlug}
          userName={user?.name.split(" ")[0] ?? "Conta"}
          logoutAction={logoutAction}
        />
        <main className="flex flex-1 flex-col gap-card-gap p-card-pad">{children}</main>
      </div>
      {modal}
    </div>
  );
}
