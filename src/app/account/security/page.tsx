import { requireGlobalSession } from "@/app/_lib/require-global-session";
import { Card } from "@/ui/components/Card";
import { Eyebrow } from "@/ui/components/Eyebrow";
import { Field } from "@/ui/components/Field";
import { Input } from "@/ui/components/Input";
import { Button } from "@/ui/components/Button";
import { ErrorNote } from "@/ui/components/ErrorNote";
import { ActivateMfaSection } from "./ActivateMfaSection";
import { disableMfaAction } from "./actions";

const ERROR_LABELS: Record<string, string> = {
  invalid_password: "Senha incorreta.",
};

/**
 * Segurança da conta — hoje só MFA (DECISIONS.md [36]). Fora do
 * namespace `/t/<slug>/` de propósito: MFA é do usuário, não do
 * tenant — o mesmo usuário pode ser `owner` numa empresa e `viewer`
 * noutra, e ativar/desativar aqui vale pras duas.
 */
export default async function SecurityPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireGlobalSession();
  const { error } = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-card-gap p-card-pad">
      <Eyebrow>Parciva</Eyebrow>
      <Card>
        <p className="text-title">Segurança</p>
        {user.mfaEnabled ? (
          <div className="mt-card-gap flex flex-col gap-card-gap">
            <p className="text-body text-content-secondary">
              Verificação em duas etapas está ativa nesta conta. Pra desativar, confirme sua senha atual.
            </p>
            <form action={disableMfaAction} className="flex flex-col gap-card-gap">
              <Field label="Senha atual">
                <Input type="password" name="password" required autoComplete="current-password" />
              </Field>
              {error && <ErrorNote>{ERROR_LABELS[error] ?? "Não foi possível desativar."}</ErrorNote>}
              <Button type="submit" variant="secondary">
                Desativar MFA
              </Button>
            </form>
          </div>
        ) : (
          <div className="mt-card-gap">
            <ActivateMfaSection />
          </div>
        )}
      </Card>
    </main>
  );
}
