/**
 * Máquina de estados do tenant — spec §4.3 — sem I/O. `TRANSITIONS`
 * reproduz exatamente o grafo da spec: trial → active|cancelled;
 * active → past_due|suspended|cancelled; past_due →
 * active|suspended|cancelled; suspended → active|cancelled;
 * cancelled → purged; purged sem saída.
 *
 * `admin_reactivate` só é válido a partir de `suspended` — é a ação
 * que desfaz uma suspensão administrativa, não o retorno de
 * `past_due` (esse caminho é `payment_confirmed`, cobrança normal).
 */

import type { Result } from "@/shared/result";
import { err, ok } from "@/shared/result";
import type { TenantStatus, TenantTransition, TransitionEvent } from "./types";

const TRANSITIONS: TenantTransition = {
  trial: {
    payment_confirmed: "active",
    cancel_requested: "cancelled",
  },
  active: {
    payment_failed: "past_due",
    admin_suspend: "suspended",
    cancel_requested: "cancelled",
  },
  past_due: {
    payment_confirmed: "active",
    admin_suspend: "suspended",
    cancel_requested: "cancelled",
  },
  suspended: {
    admin_reactivate: "active",
    cancel_requested: "cancelled",
  },
  cancelled: {
    purge_scheduled: "purged",
  },
  purged: {},
};

export function canTransition(from: TenantStatus, event: TransitionEvent): boolean {
  return TRANSITIONS[from][event] !== undefined;
}

export function transition(
  from: TenantStatus,
  event: TransitionEvent,
): Result<TenantStatus, "invalid_transition"> {
  const to = TRANSITIONS[from][event];
  return to !== undefined ? ok(to) : err("invalid_transition");
}

/** suspended: leitura permitida, ingestão bloqueada (spec §4.3) — por isso não conta como operacional. */
export function isOperational(status: TenantStatus): boolean {
  return status === "trial" || status === "active";
}

export function isReadOnly(status: TenantStatus): boolean {
  return status === "suspended";
}
