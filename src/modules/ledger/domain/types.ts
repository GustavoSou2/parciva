/**
 * Tipos puros do ledger — spec §5.5. Sem I/O.
 *
 * Convenção de direção (não estava definida na spec, registrada aqui e
 * em DECISIONS.md): `credit` reduz a dívida do contrato (pagamento
 * aplicado); `debit` aumenta a dívida (reversão de um `credit` anterior,
 * ou lançamento de ajuste). `amount_cents` é sempre a magnitude
 * (positiva) do lançamento — o sinal do efeito vem de `direction`, nunca
 * de um `amount_cents` negativo.
 */

import type { Money } from "@/shared/money";

export type LedgerDirection = "debit" | "credit";
export type LedgerActorType = "system" | "user" | "api";

export interface NewLedgerEntry {
  readonly entryType: string;
  readonly payerId?: string | null;
  readonly contractId?: string | null;
  readonly installmentId?: string | null;
  readonly paymentId?: string | null;
  readonly amountCents: Money;
  readonly direction: LedgerDirection;
  readonly reversesEntryId?: string | null;
  readonly actorType: LedgerActorType;
  readonly actorId?: string | null;
  readonly ruleVersion: string;
  readonly payload?: Record<string, unknown>;
}

export interface LedgerEntry extends NewLedgerEntry {
  readonly id: string;
  readonly sequence: bigint;
  readonly createdAt: Date;
}
