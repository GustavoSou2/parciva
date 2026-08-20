import Link from "next/link";
import { User } from "lucide-react";
import { requireTenantSession } from "@/app/_lib/require-tenant-session";
import { listPayers } from "@/modules/payers";
import { requirePermission } from "@/modules/identity";
import { isErr } from "@/shared/result";
import { Eyebrow } from "@/ui/components/Eyebrow";
import { buttonClassName } from "@/ui/components/button-class-name";

/**
 * Cartão por pagador em vez de tabela (mesmo padrão de
 * `contracts/page.tsx`) — sem pastel de estado aqui de propósito:
 * `payers.status` nunca é escrito hoje (todo pagador é "active" na
 * prática), então colorir por estado seria decoração sem sinal
 * nenhum. A consistência estrutural (cartão, ícone, raio) já é o que
 * importa pra não parecer a única tela "esquecida" do sistema.
 */
export default async function PayersPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const session = await requireTenantSession(tenantSlug);
  const canWrite = !isErr(requirePermission(session.role, "contracts:write"));
  const payers = await listPayers({ tenantId: session.tenantId });

  return (
    <>
      <div className="flex items-center justify-between">
        <Eyebrow>Pagadores</Eyebrow>
        {canWrite && (
          <Link href={`/t/${tenantSlug}/payers/new`} className={buttonClassName("secondary")}>
            Novo pagador
          </Link>
        )}
      </div>

      {payers.length === 0 ? (
        <p className="rounded-card border-hairline border-line-hairline bg-surface-card p-card-pad text-body text-content-muted shadow-card">
          Nenhum pagador cadastrado ainda. Assim que criar um, ele aparece aqui.
        </p>
      ) : (
        <ul className="flex flex-col gap-card-gap">
          {payers.map((payer) => (
            <li
              key={payer.id}
              className="rounded-card border-hairline border-line-hairline bg-surface-card p-card-pad shadow-card transition-colors duration-150 hover:border-line-strong"
            >
              <Link href={`/t/${tenantSlug}/payers/${payer.id}`} className="flex items-center gap-3">
                <User className="size-4 shrink-0 text-content-secondary" strokeWidth={1.75} />
                <div className="flex flex-1 items-center justify-between gap-4">
                  <p className="text-body font-medium text-content-primary">{payer.name}</p>
                  <div className="flex gap-6 font-mono text-aux text-content-muted">
                    <span>{payer.documentMasked ?? "—"}</span>
                    <span>{payer.phoneE164 ?? "—"}</span>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
