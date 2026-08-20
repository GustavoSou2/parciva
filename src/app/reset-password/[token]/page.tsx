"use client";

/** Tela mínima — ver nota em src/app/login/page.tsx. Sucesso redireciona igual ao login (1 tenant → direto, 2+ → escolha, 0 → mensagem). */

import { useState, type FormEvent } from "react";
import { useParams } from "next/navigation";
import { Card } from "@/ui/components/Card";
import { Eyebrow } from "@/ui/components/Eyebrow";
import { Field } from "@/ui/components/Field";
import { Input } from "@/ui/components/Input";
import { Button } from "@/ui/components/Button";
import { ErrorNote } from "@/ui/components/ErrorNote";
import { AuthBackground } from "@/ui/components/AuthBackground";

interface TenantOption {
  readonly slug: string;
  readonly name: string;
}

const ERROR_LABELS: Record<string, string> = {
  invalid_or_expired: "Este link não é mais válido — peça um novo em \"esqueci minha senha\".",
  too_short: "A senha precisa ter pelo menos 8 caracteres.",
};

export default function ResetPasswordPage() {
  const params = useParams<{ token: string }>();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [tenantOptions, setTenantOptions] = useState<TenantOption[] | null>(null);
  const [noTenant, setNoTenant] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: params.token, password }),
      });
      const data = (await response.json()) as { error?: string; tenants?: TenantOption[] };
      if (!response.ok) {
        setError(ERROR_LABELS[data.error ?? ""] ?? "Não foi possível redefinir a senha.");
        return;
      }

      const tenants = data.tenants ?? [];
      if (tenants.length === 0) {
        setNoTenant(true);
      } else if (tenants.length === 1) {
        window.location.href = `/t/${tenants[0]!.slug}/contracts`;
      } else {
        setTenantOptions(tenants);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-card-gap overflow-hidden p-card-pad">
      <AuthBackground />
      <Eyebrow>Parciva</Eyebrow>
      {tenantOptions ? (
        <Card>
          <p className="text-title">Escolha a empresa</p>
          <div className="mt-card-gap flex flex-col gap-2">
            {tenantOptions.map((tenant) => (
              <a
                key={tenant.slug}
                href={`/t/${tenant.slug}/contracts`}
                className="rounded-field border-hairline border-line-hairline px-3 py-2 text-body text-content-primary hover:border-line-strong"
              >
                {tenant.name}
              </a>
            ))}
          </div>
        </Card>
      ) : noTenant ? (
        <Card>
          <p className="text-body text-content-primary">
            Senha redefinida, mas sua conta não pertence a nenhuma empresa ainda.
          </p>
        </Card>
      ) : (
        <Card>
          <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-card-gap">
            <p className="text-title">Nova senha</p>
            <Field label="Senha (mín. 8 caracteres)">
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
              />
            </Field>
            {error && <ErrorNote>{error}</ErrorNote>}
            <Button type="submit" disabled={loading}>
              {loading ? "Confirmando..." : "Redefinir senha"}
            </Button>
          </form>
        </Card>
      )}
    </main>
  );
}
