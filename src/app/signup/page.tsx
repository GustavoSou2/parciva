"use client";

/** Tela mínima — ver nota em src/app/login/page.tsx. */

import { useState, type FormEvent } from "react";
import { Card } from "@/ui/components/Card";
import { Eyebrow } from "@/ui/components/Eyebrow";
import { Field } from "@/ui/components/Field";
import { Input } from "@/ui/components/Input";
import { Button } from "@/ui/components/Button";
import { ErrorNote } from "@/ui/components/ErrorNote";

export default function SignupPage() {
  const [name, setName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const ERROR_LABELS: Record<string, string> = {
    plan_not_found: "Plano inválido.",
    slug_conflict: "Já existe uma empresa com esse nome — tente um nome diferente.",
    save_failed: "Falha ao criar a conta — tente de novo.",
    too_short: "A senha precisa ter pelo menos 8 caracteres.",
    missing_fields: "Preencha todos os campos.",
  };

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, ownerName, ownerEmail, ownerPassword }),
      });
      const data = (await response.json()) as { error?: string; tenantSlug?: string };
      if (!response.ok) {
        setError(ERROR_LABELS[data.error ?? ""] ?? "Não foi possível criar a conta.");
        return;
      }
      window.location.href = data.tenantSlug ? `/t/${data.tenantSlug}/contracts` : "/";
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-card-gap p-card-pad">
      <Eyebrow>Parciva</Eyebrow>
      <Card>
        <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-card-gap">
          <p className="text-title">Criar conta</p>
          <Field label="Nome da empresa">
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </Field>
          <Field label="Seu nome">
            <Input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} required />
          </Field>
          <Field label="Seu e-mail">
            <Input
              type="email"
              value={ownerEmail}
              onChange={(e) => setOwnerEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </Field>
          <Field label="Senha (mín. 8 caracteres)">
            <Input
              type="password"
              value={ownerPassword}
              onChange={(e) => setOwnerPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
          </Field>
          {error && <ErrorNote>{error}</ErrorNote>}
          <Button type="submit" disabled={loading}>
            {loading ? "Criando..." : "Criar conta"}
          </Button>
        </form>
      </Card>
    </main>
  );
}
