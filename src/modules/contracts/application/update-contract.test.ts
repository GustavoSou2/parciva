import { describe, expect, it, vi } from "vitest";
import { isErr, isOk } from "@/shared/result";
import { updateContract, type UpdateContractDeps } from "./update-contract";

interface Spies {
  readonly externalRefExistsExcluding: ReturnType<
    typeof vi.fn<(externalRef: string, excludeContractId: string) => Promise<boolean>>
  >;
  readonly saveContractMetadata: ReturnType<typeof vi.fn<(data: unknown) => Promise<void>>>;
}

function buildDeps(overrides: Partial<Spies> = {}): { deps: UpdateContractDeps; spies: Spies } {
  const spies: Spies = {
    externalRefExistsExcluding: vi.fn().mockResolvedValue(false),
    saveContractMetadata: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  return { deps: spies, spies };
}

const CTX = { tenantId: "tenant-1" };

describe("updateContract", () => {
  it("sem externalRef -> persiste sem checar duplicidade", async () => {
    const { deps, spies } = buildDeps();
    const result = await updateContract(CTX, "contract-1", { description: "novo texto" }, deps);
    expect(isOk(result)).toBe(true);
    expect(spies.externalRefExistsExcluding).not.toHaveBeenCalled();
    expect(spies.saveContractMetadata).toHaveBeenCalledWith({ description: "novo texto", externalRef: null });
  });

  it("externalRef já usado por OUTRO contrato -> Err duplicate_external_ref", async () => {
    const { deps, spies } = buildDeps({ externalRefExistsExcluding: vi.fn().mockResolvedValue(true) });
    const result = await updateContract(CTX, "contract-1", { externalRef: "CTR-001" }, deps);
    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error).toBe("duplicate_external_ref");
    expect(spies.saveContractMetadata).not.toHaveBeenCalled();
  });

  it("externalRef igual ao que o próprio contrato já tinha -> não bloqueia", async () => {
    const { deps, spies } = buildDeps();
    const result = await updateContract(CTX, "contract-1", { externalRef: "CTR-001" }, deps);
    expect(isOk(result)).toBe(true);
    expect(spies.externalRefExistsExcluding).toHaveBeenCalledWith("CTR-001", "contract-1");
  });
});
