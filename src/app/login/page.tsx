"use client";

/**
 * Tela mínima — formulário funcional com os tokens Parciva aplicados
 * (spec §13.1), mas ainda sem a composição final de layout de auth da
 * spec (isso viria com uma tela de "Conta"/onboarding própria, fora do
 * escopo dos marcos atuais).
 *
 * Campo "empresa" é um atalho de navegação, não autenticação — o
 * usuário pode pertencer a mais de um tenant, e não existe hoje um
 * jeito de listar "meus tenants" sem já saber o slug de um deles
 * (`memberships` tem RLS de verdade, não dá pra fazer essa consulta às
 * cegas — ver comentário em `identity/infra/membership-repository.ts`).
 * Deixado vazio, cai em `/`. A validação real de acesso continua
 * acontecendo em `requireTenantSession` na página seguinte, não aqui.
 */

import { useState, type FormEvent } from "react";
import { Card } from "@/ui/components/Card";
import { Eyebrow } from "@/ui/components/Eyebrow";
import { Field } from "@/ui/components/Field";
import { Input } from "@/ui/components/Input";
import { Button } from "@/ui/components/Button";
import { ErrorNote } from "@/ui/components/ErrorNote";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [tenantSlug, setTenantSlug] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
      window.location.href = tenantSlug.trim() ? `/t/${tenantSlug.trim()}/contracts` : "/";
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-card-gap p-card-pad">
      <Eyebrow>Parciva</Eyebrow>
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
          <Field label="Empresa (opcional — slug da URL, ex.: padaria-sao-jorge)">
            <Input value={tenantSlug} onChange={(e) => setTenantSlug(e.target.value)} />
          </Field>
          {error && <ErrorNote>{error}</ErrorNote>}
          <Button type="submit" disabled={loading}>
            {loading ? "Entrando..." : "Entrar"}
          </Button>
        </form>
      </Card>
    </main>
  );
}
