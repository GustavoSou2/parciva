"use client";

/**
 * Tela mínima — formulário funcional com os tokens Parciva aplicados
 * (spec §13.1), mas ainda sem a composição final de layout de auth da
 * spec (isso viria com uma tela de "Conta"/onboarding própria, fora do
 * escopo dos marcos atuais).
 *
 * Sem campo manual de "empresa" — `/api/auth/login` agora devolve a
 * lista real de tenants do usuário (`listMembershipsForUser`, via
 * `getUserDb`/policy `self_membership_lookup`, sem bypassar RLS —
 * DECISIONS.md). Login com 1 tenant só redireciona direto; com mais de
 * um, mostra a escolha aqui mesmo, sem navegar pra outra página.
 *
 * MFA (DECISIONS.md [36]): se `/api/auth/login` devolver
 * `mfaRequired`, mostra um segundo passo pedindo o código (TOTP ou
 * recuperação) antes de qualquer sessão existir — nenhum cookie foi
 * setado ainda nesse ponto.
 */

import { useState, type FormEvent } from "react";
import Link from "next/link";
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

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [tenantOptions, setTenantOptions] = useState<TenantOption[] | null>(null);

  function handleTenantResponse(data: { tenants: TenantOption[] }) {
    if (data.tenants.length === 0) {
      setError("Sua conta não pertence a nenhuma empresa ainda.");
    } else if (data.tenants.length === 1) {
      window.location.href = `/t/${data.tenants[0]!.slug}/contracts`;
    } else {
      setTenantOptions(data.tenants);
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        setError(
          data.error === "rate_limited"
            ? "Muitas tentativas — aguarde um pouco antes de tentar de novo."
            : "E-mail ou senha incorretos.",
        );
        return;
      }

      const data = (await response.json()) as { mfaRequired?: boolean; challengeToken?: string; tenants?: TenantOption[] };
      if (data.mfaRequired && data.challengeToken) {
        setChallengeToken(data.challengeToken);
        return;
      }

      handleTenantResponse({ tenants: data.tenants ?? [] });
    } finally {
      setLoading(false);
    }
  }

  async function onSubmitMfaCode(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const response = await fetch("/api/auth/mfa-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeToken, code: mfaCode }),
      });
      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        setError(
          data.error === "rate_limited"
            ? "Muitas tentativas — aguarde um pouco antes de tentar de novo."
            : "Código incorreto ou expirado.",
        );
        return;
      }

      const data = (await response.json()) as { tenants: TenantOption[] };
      handleTenantResponse(data);
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
      ) : challengeToken ? (
        <Card>
          <form onSubmit={(e) => void onSubmitMfaCode(e)} className="flex flex-col gap-card-gap">
            <p className="text-title">Verificação em duas etapas</p>
            <Field label="Código do app autenticador (ou de recuperação)">
              <Input
                type="text"
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value)}
                required
                autoComplete="one-time-code"
                autoFocus
              />
            </Field>
            {error && <ErrorNote>{error}</ErrorNote>}
            <Button type="submit" disabled={loading}>
              {loading ? "Verificando..." : "Confirmar"}
            </Button>
          </form>
        </Card>
      ) : (
        <Card>
          <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-card-gap">
            <p className="text-title">Entrar</p>
            <Field label="E-mail">
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </Field>
            <Field label="Senha">
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </Field>
            {error && <ErrorNote>{error}</ErrorNote>}
            <Button type="submit" disabled={loading}>
              {loading ? "Entrando..." : "Entrar"}
            </Button>
            <p className="text-body text-content-secondary">
              <Link href="/forgot-password" className="text-accent hover:underline">
                Esqueceu a senha?
              </Link>
            </p>
          </form>
        </Card>
      )}
    </main>
  );
}
