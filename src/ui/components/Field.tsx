import type { ReactNode } from "react";
import { Eyebrow } from "./Eyebrow";

/** Rótulo + controle — usado em todo formulário do projeto, evita repetir a mesma estrutura de `<label>` + `Eyebrow`. */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <Eyebrow>{label}</Eyebrow>
      {children}
    </label>
  );
}
