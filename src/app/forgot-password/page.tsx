"use client";

/** Tela mínima — ver nota em src/app/login/page.tsx. Mensagem de sucesso é sempre a mesma, exista ou não o e-mail (anti-enumeração). */

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Card } from "@/ui/components/Card";
import { Eyebrow } from "@/ui/components/Eyebrow";
import { Field } from "@/ui/components/Field";
import { Input } from "@/ui/components/Input";
import { Button } from "@/ui/components/Button";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    try {
      await fetch("/api/auth/request-password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      // Mesma mensagem sempre — a resposta da API não distingue os casos.
      setSent(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-card-gap p-card-pad">
      <Eyebrow>Parciva</Eyebrow>
      <Card>
        {sent ? (
          <p className="text-body text-content-primary">
            Se esse e-mail existir na nossa base, você vai receber um link para redefinir a senha.
          </p>
        ) : (
          <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-card-gap">
            <p className="text-title">Esqueci minha senha</p>
            <Field label="E-mail">
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </Field>
            <Button type="submit" disabled={loading}>
              {loading ? "Enviando..." : "Enviar link de redefinição"}
            </Button>
          </form>
        )}
        <p className="mt-card-gap text-body text-content-secondary">
          <Link href="/login" className="text-content-primary hover:underline">
            Voltar para o login
          </Link>
        </p>
      </Card>
    </main>
  );
}
