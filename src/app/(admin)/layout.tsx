import type { ReactNode } from "react";
import { headers } from "next/headers";
import { unauthorized } from "next/navigation";
import { getAdminDb } from "@/db/admin-client";

/**
 * Layout raiz do painel de superadmin — spec §12. `getAdminDb()` é
 * importado aqui para deixar explícito que este é o único ponto do
 * projeto autorizado a fazer isso (comentário em admin-client.ts); as
 * páginas de tarefa 4 chamam a função quando pararem de ser stub.
 */
void getAdminDb;

/**
 * Placeholder de autenticação — spec §12 ainda pede MFA e login
 * independente, fora do escopo desta tarefa. `x-admin-secret` falha
 * fechado: sem ADMIN_SECRET configurado, nenhuma requisição passa.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const requestHeaders = await headers();
  const adminSecret = process.env.ADMIN_SECRET;

  if (!adminSecret || requestHeaders.get("x-admin-secret") !== adminSecret) {
    unauthorized();
  }

  return (
    <div>
      <div className="border-hairline border-line-strong bg-surface-panel p-card-pad text-content-primary">
        ⚠️ Painel de administração — ações aqui afetam todos os tenants
      </div>
      {children}
    </div>
  );
}
