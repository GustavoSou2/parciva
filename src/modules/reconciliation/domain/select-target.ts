/**
 * Seleção de contrato-alvo — spec §6.4. Puro: dado o pagador já
 * identificado e seus contratos (com as parcelas elegíveis de cada
 * um), decide para qual contrato o pagamento deveria ir. Nunca
 * adivinha — a spec é explícita: sem um jeito seguro de decidir,
 * cai em revisão humana.
 */

import { add, isZero, type Money } from "@/shared/money";
import type { AllocatableInstallment } from "./types";
import { owedCents } from "./allocation-engine";

export interface ContractCandidate {
  readonly contractId: string;
  readonly status: string;
  readonly installments: readonly AllocatableInstallment[];
}

export type SelectTargetResult =
  | { readonly outcome: "selected"; readonly contractId: string }
  | { readonly outcome: "no_target" }
  | { readonly outcome: "ambiguous"; readonly candidateContractIds: readonly string[] };

const ELIGIBLE_STATUSES: ReadonlySet<AllocatableInstallment["status"]> = new Set([
  "pending",
  "partial",
  "overdue",
]);

function totalOwed(installments: readonly AllocatableInstallment[]): Money {
  return installments
    .filter((i) => ELIGIBLE_STATUSES.has(i.status))
    .reduce((sum, i) => add(sum, owedCents(i)), 0 as Money);
}

export function selectTarget(
  contracts: readonly ContractCandidate[],
  amountCents: Money,
): SelectTargetResult {
  const active = contracts.filter((c) => c.status === "active");

  if (active.length === 0) return { outcome: "no_target" };
  if (active.length === 1) return { outcome: "selected", contractId: active[0]!.contractId };

  // Desempate: valor pago bate exatamente com o total devido (elegível) de UM único contrato.
  const exactMatches = active.filter((c) => {
    const owed = totalOwed(c.installments);
    return !isZero(owed) && owed === amountCents;
  });

  if (exactMatches.length === 1) {
    return { outcome: "selected", contractId: exactMatches[0]!.contractId };
  }

  return { outcome: "ambiguous", candidateContractIds: active.map((c) => c.contractId) };
}
