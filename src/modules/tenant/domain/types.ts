/**
 * Ciclo de vida do tenant — spec §4.3: `trial → active → past_due →
 * suspended → cancelled → purged`. `TenantTransition` só descreve o
 * formato da tabela de transições válidas; os dados (quais eventos
 * disparam qual transição) vivem em `lifecycle.ts` — aqui é só tipo,
 * sem lógica.
 */

export type TenantStatus = "trial" | "active" | "past_due" | "suspended" | "cancelled" | "purged";

export type TransitionEvent =
  | "payment_confirmed"
  | "payment_failed"
  | "payment_overdue"
  | "admin_suspend"
  | "admin_reactivate"
  | "cancel_requested"
  | "purge_scheduled";

export type TenantTransition = Record<
  TenantStatus,
  Partial<Record<TransitionEvent, TenantStatus>>
>;
