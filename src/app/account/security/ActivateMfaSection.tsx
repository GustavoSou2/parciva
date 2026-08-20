"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import gsap from "gsap";
import { Field } from "@/ui/components/Field";
import { Input } from "@/ui/components/Input";
import { Button } from "@/ui/components/Button";
import { ErrorNote } from "@/ui/components/ErrorNote";
import { usePrefersReducedMotion } from "@/ui/motion/reduced-motion";
import { confirmEnrollmentAction, startEnrollmentAction, type EnrollmentView } from "./actions";

export function ActivateMfaSection() {
  const [enrollment, setEnrollment] = useState<EnrollmentView | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState<readonly string[] | null>(null);
  const recoveryListRef = useRef<HTMLUListElement>(null);
  const prefersReducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    void startEnrollmentAction().then(setEnrollment);
  }, []);

  // Tela-bandeira do refinamento de UI (DECISIONS.md) — momento único
  // (mostrado uma vez só, nunca de novo) ganha entrada em stagger; sem
  // isso é só uma lista aparecendo, o peso da ação (10 códigos que
  // salvam a conta se o autenticador se perder) pede mais que isso.
  useEffect(() => {
    if (!recoveryCodes) return;
    const items = recoveryListRef.current?.querySelectorAll<HTMLElement>("li");
    if (!items || items.length === 0) return;

    if (prefersReducedMotion) {
      gsap.set(items, { opacity: 1, y: 0 });
      return;
    }
    gsap.fromTo(
      items,
      { opacity: 0, y: 6 },
      { opacity: 1, y: 0, duration: 0.24, ease: "power2.out", stagger: 0.035 },
    );
  }, [recoveryCodes, prefersReducedMotion]);

  async function onConfirm(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await confirmEnrollmentAction(code);
      if (!result.ok) {
        setError(
          result.error === "invalid_code"
            ? "Código incorreto — confira o horário do celular e tente de novo."
            : "A ativação expirou. Recarregue a página e comece de novo.",
        );
        return;
      }
      setRecoveryCodes(result.recoveryCodes ?? []);
    } finally {
      setLoading(false);
    }
  }

  if (recoveryCodes) {
    return (
      <div className="flex flex-col gap-card-gap">
        <p className="text-title">MFA ativado</p>
        <p className="text-body text-content-secondary">
          Guarde estes códigos de recuperação em lugar seguro. Cada um funciona só uma vez, pra quando você
          perder acesso ao app autenticador — eles não aparecem de novo depois desta tela.
        </p>
        <ul
          ref={recoveryListRef}
          className="grid grid-cols-2 gap-2 rounded-field border-hairline border-line-hairline p-3 font-mono text-body"
        >
          {recoveryCodes.map((recoveryCode) => (
            <li key={recoveryCode}>{recoveryCode}</li>
          ))}
        </ul>
        <Button type="button" onClick={() => window.location.reload()}>
          Já salvei os códigos
        </Button>
      </div>
    );
  }

  if (!enrollment) {
    return <p className="text-body text-content-secondary">Gerando segredo...</p>;
  }

  return (
    <form onSubmit={(e) => void onConfirm(e)} className="flex flex-col gap-card-gap">
      <p className="text-title">Ativar verificação em duas etapas</p>
      <p className="text-body text-content-secondary">
        Escaneie o QR com um app autenticador (Google Authenticator, Authy, 1Password...) ou digite o código
        abaixo manualmente. Depois, confirme com o código de 6 dígitos que o app mostrar.
      </p>
      {/* Data URL gerado no servidor (qrcode) — nunca um src externo, `next/image` não otimiza data: URI. */}
      <img src={enrollment.qrDataUrl} alt="QR code de ativação do MFA" width={200} height={200} />
      <p className="rounded-field border-hairline border-line-hairline bg-surface-card px-3 py-2 font-mono text-body break-all">
        {enrollment.secretBase32}
      </p>
      <Field label="Código de 6 dígitos">
        <Input
          type="text"
          inputMode="numeric"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          required
          autoFocus
        />
      </Field>
      {error && <ErrorNote>{error}</ErrorNote>}
      <Button type="submit" disabled={loading}>
        {loading ? "Confirmando..." : "Confirmar e ativar"}
      </Button>
    </form>
  );
}
