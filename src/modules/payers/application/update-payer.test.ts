/**
 * Primeiro teste de `application/` neste módulo (domain/infra tinham
 * teste, `application/create-payer.ts` não) — mesma exceção deliberada
 * de `identity/application/reset-password.test.ts` (decisão [33]): a
 * regra de "documento duplicado excluindo o próprio" é o tipo de coisa
 * fácil de acertar errado silenciosamente, vale testar.
 */

import { describe, expect, it, vi } from "vitest";
import { isErr, isOk } from "@/shared/result";
import { updatePayer, type UpdatePayerDeps } from "./update-payer";

interface Spies {
  readonly documentHashExistsExcluding: ReturnType<
    typeof vi.fn<(hash: string, excludePayerId: string) => Promise<boolean>>
  >;
  readonly savePayerUpdate: ReturnType<typeof vi.fn<(data: unknown) => Promise<void>>>;
}

function buildDeps(overrides: Partial<Spies> = {}): { deps: UpdatePayerDeps; spies: Spies } {
  const spies: Spies = {
    documentHashExistsExcluding: vi.fn().mockResolvedValue(false),
    savePayerUpdate: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  return { deps: { documentHashPepper: "pepper-teste", ...spies }, spies };
}

const CTX = { tenantId: "tenant-1" };

describe("updatePayer", () => {
  it("nome vazio -> Err empty_name, nada é persistido", async () => {
    const { deps, spies } = buildDeps();
    const result = await updatePayer(CTX, "payer-1", { name: "   " }, deps);
    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error).toBe("empty_name");
    expect(spies.savePayerUpdate).not.toHaveBeenCalled();
  });

  it("documento inválido -> Err invalid_document", async () => {
    const { deps } = buildDeps();
    const result = await updatePayer(CTX, "payer-1", { name: "João", document: "000.000.000-00" }, deps);
    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error).toBe("invalid_document");
  });

  it("documento já usado por OUTRO pagador -> Err duplicate_document", async () => {
    const { deps } = buildDeps({ documentHashExistsExcluding: vi.fn().mockResolvedValue(true) });
    const result = await updatePayer(CTX, "payer-1", { name: "João", document: "111.444.777-35" }, deps);
    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error).toBe("duplicate_document");
  });

  it("documento igual ao que o próprio pagador já tinha -> não bloqueia (exclui o próprio da checagem)", async () => {
    const { deps, spies } = buildDeps();
    const result = await updatePayer(CTX, "payer-1", { name: "João", document: "111.444.777-35" }, deps);
    expect(isOk(result)).toBe(true);
    expect(spies.documentHashExistsExcluding).toHaveBeenCalledWith(expect.any(String), "payer-1");
    expect(spies.savePayerUpdate).toHaveBeenCalledTimes(1);
  });
});
