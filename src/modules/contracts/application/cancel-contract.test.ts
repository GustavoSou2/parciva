import { describe, expect, it, vi } from "vitest";
import { isErr, isOk } from "@/shared/result";
import { money } from "@/shared/money";
import { cancelContract, type CancelContractDeps } from "./cancel-contract";
import type { Contract } from "../domain/types";

function buildContract(overrides: Partial<Contract> = {}): Contract {
  return {
    id: "contract-1",
    payerId: "payer-1",
    externalRef: null,
    description: null,
    principalCents: money(10_000),
    installmentsCount: 1,
    earlyPaymentPolicy: "credit_balance",
    toleranceCents: money(0),
    startDate: "2026-01-01",
    status: "active",
    ...overrides,
  };
}

interface Spies {
  readonly getContractById: ReturnType<typeof vi.fn<(contractId: string) => Promise<Contract | null>>>;
  readonly cancelContractTx: ReturnType<typeof vi.fn<(contractId: string) => Promise<void>>>;
}

function buildDeps(overrides: Partial<Spies> = {}): { deps: CancelContractDeps; spies: Spies } {
  const spies: Spies = {
    getContractById: vi.fn().mockResolvedValue(buildContract()),
    cancelContractTx: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  return { deps: spies, spies };
}

const CTX = { tenantId: "tenant-1" };

describe("cancelContract", () => {
  it("contrato não encontrado -> Err contract_not_found", async () => {
    const { deps, spies } = buildDeps({ getContractById: vi.fn().mockResolvedValue(null) });
    const result = await cancelContract(CTX, "contract-1", deps);
    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error).toBe("contract_not_found");
    expect(spies.cancelContractTx).not.toHaveBeenCalled();
  });

  it("contrato já cancelado -> Err already_cancelled, nunca cancela de novo", async () => {
    const { deps, spies } = buildDeps({
      getContractById: vi.fn().mockResolvedValue(buildContract({ status: "cancelled" })),
    });
    const result = await cancelContract(CTX, "contract-1", deps);
    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error).toBe("already_cancelled");
    expect(spies.cancelContractTx).not.toHaveBeenCalled();
  });

  it("contrato ativo -> cancela", async () => {
    const { deps, spies } = buildDeps();
    const result = await cancelContract(CTX, "contract-1", deps);
    expect(isOk(result)).toBe(true);
    expect(spies.cancelContractTx).toHaveBeenCalledWith("contract-1");
  });
});
