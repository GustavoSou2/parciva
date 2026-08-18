import type { ReactNode } from "react";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireTenantSession } from "@/app/_lib/require-tenant-session";
import { deleteSession, logout } from "@/modules/identity";
import { SESSION_COOKIE_NAME } from "@/shared/session-cookie";
import { Button } from "@/ui/components/Button";

async function logoutAction(): Promise<void> {
  "use server";
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (token) {
    await logout(token, { deleteSession });
  }
  cookieStore.delete(SESSION_COOKIE_NAME);
  redirect("/login");
}

/**
 * Cabeçalho mínimo — não a navegação completa da spec §13.2 (7 telas:
 * Painel, Fila de revisão, Contratos, Pagadores, Comprovantes,
 * Configurações, Conta). Só Contratos/Pagadores existem neste marco.
 */
export default async function TenantLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  await requireTenantSession(tenantSlug);

  return (
    <div className="min-h-screen bg-surface-canvas">
      <header className="flex h-nav items-center justify-between border-hairline border-b-line-hairline bg-surface-panel px-card-pad">
        <nav className="flex items-center gap-nav-gap">
          <span className="pr-4 text-body font-medium text-content-primary">Parciva</span>
          <Link
            href={`/t/${tenantSlug}/contracts`}
            className="text-body text-content-secondary hover:text-content-primary"
          >
            Contratos
          </Link>
          <Link
            href={`/t/${tenantSlug}/payers`}
            className="text-body text-content-secondary hover:text-content-primary"
          >
            Pagadores
          </Link>
        </nav>
        <form action={logoutAction}>
          <Button type="submit" variant="secondary">
            Sair
          </Button>
        </form>
      </header>
      <main className="flex flex-col gap-card-gap p-card-pad">{children}</main>
    </div>
  );
}
