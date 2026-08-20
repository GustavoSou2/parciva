import Link from "next/link";
import { requireTenantSession } from "@/app/_lib/require-tenant-session";
import { listStatementImports } from "@/modules/statements";
import { requirePermission } from "@/modules/identity";
import { isErr } from "@/shared/result";
import { Card } from "@/ui/components/Card";
import { Eyebrow } from "@/ui/components/Eyebrow";
import { Field } from "@/ui/components/Field";
import { Input } from "@/ui/components/Input";
import { Button } from "@/ui/components/Button";
import { ErrorNote } from "@/ui/components/ErrorNote";
import { uploadStatementAction } from "./actions";

const ERROR_LABELS: Record<string, string> = {
  unauthorized: "Você não tem permissão para importar extratos.",
  missing_file: "Selecione um arquivo CSV.",
  empty: "O arquivo está vazio.",
  missing_headers: "Não encontrei as colunas de data/descrição/valor no cabeçalho do CSV.",
};

/** Conciliação por extrato (Fase 5, fatia 2, spec §8.1 Camada D) — importar extrato CSV e casar por E2E ID. */
export default async function StatementsPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { tenantSlug } = await params;
  const { error } = await searchParams;
  const session = await requireTenantSession(tenantSlug);
  const canWrite = !isErr(requirePermission(session.role, "payments:write"));

  const imports = await listStatementImports({ tenantId: session.tenantId });
  const uploadAction = uploadStatementAction.bind(null, tenantSlug);

  // Resumo mínimo (DESIGN.md v6 §4.7) — `lineCount`/`matchedCount` já
  // vêm por linha na própria consulta, reduce em memória, sem query nova.
  const totalLines = imports.reduce((acc, i) => acc + i.lineCount, 0);
  const totalMatched = imports.reduce((acc, i) => acc + i.matchedCount, 0);

  return (
    <>
      <Eyebrow>Conciliação por extrato</Eyebrow>

      {imports.length > 0 && (
        <div className="flex flex-wrap gap-6 rounded-card border-hairline border-line-hairline bg-surface-card p-4 shadow-card sm:p-card-pad">
          <div>
            <span className="font-mono text-micro tracking-micro text-content-secondary uppercase">
              Importações
            </span>
            <p className="mt-1 font-num text-metric-sm text-content-primary tabular-nums">{imports.length}</p>
          </div>
          <div>
            <span className="font-mono text-micro tracking-micro text-content-secondary uppercase">
              Linhas
            </span>
            <p className="mt-1 font-num text-metric-sm text-content-primary tabular-nums">{totalLines}</p>
          </div>
          <div>
            <span className="font-mono text-micro tracking-micro text-content-secondary uppercase">
              Casadas
            </span>
            <p className="mt-1 font-num text-metric-sm text-content-primary tabular-nums">
              {totalLines > 0 ? `${Math.round((totalMatched / totalLines) * 100)}%` : "—"}
            </p>
          </div>
        </div>
      )}

      {canWrite && (
        <Card>
          <form action={uploadAction} className="flex flex-col gap-card-gap">
            <Field label="Extrato (CSV)">
              <Input name="file" type="file" accept=".csv,text/csv" required />
            </Field>
            {error && <ErrorNote>{ERROR_LABELS[error] ?? "Não foi possível importar o extrato."}</ErrorNote>}
            <Button type="submit" className="self-start">
              Importar
            </Button>
          </form>
        </Card>
      )}

      <div className="flex flex-col gap-card-gap lg:flex-row">
        <Card className="flex-1">
          {imports.length === 0 ? (
            <p className="text-body text-content-muted">Nenhum extrato importado ainda.</p>
          ) : (
            <table className="w-full text-left text-body">
              <thead>
                <tr className="border-b border-line-hairline text-content-secondary">
                  <th className="pb-2 font-medium">Data</th>
                  <th className="pb-2 font-medium">Arquivo</th>
                  <th className="pb-2 font-medium">Linhas</th>
                  <th className="pb-2 font-medium">Casadas</th>
                  <th className="pb-2"></th>
                </tr>
              </thead>
              <tbody>
                {imports.map((statementImport) => (
                  <tr key={statementImport.id} className="border-b border-line-hairline">
                    <td className="py-2 text-content-secondary">
                      {statementImport.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                    </td>
                    <td className="py-2 text-content-secondary">{statementImport.filename}</td>
                    <td className="py-2 font-num tabular-nums">{statementImport.lineCount}</td>
                    <td className="py-2 font-num tabular-nums">{statementImport.matchedCount}</td>
                    <td className="py-2">
                      <Link
                        href={`/t/${tenantSlug}/statements/${statementImport.id}`}
                        className="text-accent hover:underline"
                      >
                        Ver linhas
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        {/* Rail direita (DESIGN.md v6 §4.7.2) — últimos imports, reaproveita a mesma lista já buscada (já vem ordenada por `createdAt` desc), sem query nova. */}
        {imports.length > 3 && (
          <aside className="flex w-full flex-col gap-2 lg:w-rail lg:shrink-0">
            <Eyebrow>Últimos imports</Eyebrow>
            {imports.slice(0, 3).map((statementImport) => (
              <Link
                key={statementImport.id}
                href={`/t/${tenantSlug}/statements/${statementImport.id}`}
                className="cartao-rail flex items-center justify-between gap-3 transition-colors duration-150 hover:border-line-strong"
              >
                <div className="overflow-hidden">
                  <p className="truncate text-body text-content-primary">{statementImport.filename}</p>
                  <p className="font-mono text-aux text-content-muted">
                    {statementImport.matchedCount}/{statementImport.lineCount} casadas
                  </p>
                </div>
              </Link>
            ))}
          </aside>
        )}
      </div>
    </>
  );
}
