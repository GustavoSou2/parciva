/**
 * Tipos puros do domínio de pagadores — spec §5.2. Sem I/O.
 */

export type PayerDocumentType = "cpf" | "cnpj" | "none";

export interface Payer {
  readonly id: string;
  readonly name: string;
  readonly documentType: PayerDocumentType;
  readonly documentMasked: string | null;
  readonly phoneE164: string | null;
  readonly email: string | null;
  readonly status: string;
}

/** Entrada crua de cadastro — documento vem sem máscara, como o operador digitou. */
export interface NewPayerInput {
  readonly name: string;
  readonly document?: string;
  readonly phoneE164?: string;
  readonly email?: string;
}

/** Saída de `validateNewPayer` — pronta para persistir (documento já normalizado/mascarado). */
export interface ValidatedPayer {
  readonly name: string;
  readonly documentType: PayerDocumentType;
  readonly document: string | null;
  readonly documentMasked: string | null;
  readonly phoneE164: string | null;
  readonly email: string | null;
}
