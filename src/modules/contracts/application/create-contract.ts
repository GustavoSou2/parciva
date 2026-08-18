/**
 * Criação de contrato + geração do cronograma de parcelas — spec §14
 * Fase 1. `deps.saveContractWithSchedule` grava contrato e parcelas na
 * mesma transação (uma unidade — não faz sentido existir contrato sem
 * cronograma, nem cronograma órfão).
 */

import type { TenantContext } from "@/db/client";
import type { Result } from "@/shared/result";
import { err, isErr, ok } from "@/shared/result";
import { ZERO, type Money } from "@/shared/money";
import type { EarlyPaymentPolicy, InstallmentSchedule, NewContractInput } from "../domain/types";
import { generateMonthlySchedule, type GenerateScheduleError } from "../domain/schedule";

/** `earlyPaymentPolicy`/`toleranceCents` sempre resolvidos — a normalização de default acontece logo abaixo, antes de chamar `deps`. */
type NormalizedContractInput = NewContractInput & {
  earlyPaymentPolicy: EarlyPaymentPolicy;
  toleranceCents: Money;
};

export interface CreateContractDeps {
  externalRefExists(externalRef: string): Promise<boolean>;
  saveContractWithSchedule(
    input: NormalizedContractInput,
    schedule: InstallmentSchedule[],
  ): Promise<{ contractId: string }>;
}

export type CreateContractError = GenerateScheduleError | "duplicate_external_ref";

export async function createContract(
  ctx: TenantContext,
  input: NewContractInput,
  deps: CreateContractDeps,
): Promise<Result<{ contractId: string }, CreateContractError>> {
  void ctx; // deps já chegam com o tenant amarrado por quem os monta (infra) — mesmo padrão do resto do projeto.

  if (input.externalRef && (await deps.externalRefExists(input.externalRef))) {
    return err("duplicate_external_ref");
  }

  const schedule = generateMonthlySchedule(
    input.principalCents,
    input.installmentsCount,
    input.startDate,
  );
  if (isErr(schedule)) return schedule;

  const normalizedInput: NormalizedContractInput = {
    ...input,
    earlyPaymentPolicy: input.earlyPaymentPolicy ?? "credit_balance",
    toleranceCents: input.toleranceCents ?? ZERO,
  };

  const { contractId } = await deps.saveContractWithSchedule(normalizedInput, schedule.value);
  return ok({ contractId });
}
