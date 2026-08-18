import { describe, expect, it } from "vitest";
import { money, ZERO } from "@/shared/money";
import { selectTarget, type ContractCandidate } from "./select-target";
import type { AllocatableInstallment } from "./types";

function installment(overrides: Partial<AllocatableInstallment> & { id: string }): AllocatableInstallment {
  return {
    dueDate: "2026-01-01",
    amountCents: money(10000),
    fineCents: ZERO,
    interestCents: ZERO,
    paidCents: ZERO,
    status: "pending",
    ...overrides,
  };
}

function contract(overrides: Partial<ContractCandidate> & { contractId: string }): ContractCandidate {
  return {
    status: "active",
    installments: [],
    ...overrides,
  };
}

describe("selectTarget — §6.4", () => {
  it("sem contratos ativos -> sem alvo", () => {
    const result = selectTarget([], money(10000));
    expect(result).toEqual({ outcome: "no_target" });
  });

  it("contrato cancelado não conta como candidato", () => {
    const cancelled = contract({ contractId: "c1", status: "cancelled" });
    const result = selectTarget([cancelled], money(10000));
    expect(result).toEqual({ outcome: "no_target" });
  });

  it("um único contrato ativo -> seleciona direto, sem checar valor", () => {
    const only = contract({ contractId: "c1" });
    const result = selectTarget([only], money(999999));
    expect(result).toEqual({ outcome: "selected", contractId: "c1" });
  });

  it("mais de um contrato -> desempata por valor batendo exatamente com o devido de um único", () => {
    const c1 = contract({
      contractId: "c1",
      installments: [installment({ id: "i1", amountCents: money(10000) })],
    });
    const c2 = contract({
      contractId: "c2",
      installments: [installment({ id: "i2", amountCents: money(25000) })],
    });
    const result = selectTarget([c1, c2], money(25000));
    expect(result).toEqual({ outcome: "selected", contractId: "c2" });
  });

  it("mais de um contrato, valor não bate com nenhum -> ambíguo, nunca adivinha", () => {
    const c1 = contract({
      contractId: "c1",
      installments: [installment({ id: "i1", amountCents: money(10000) })],
    });
    const c2 = contract({
      contractId: "c2",
      installments: [installment({ id: "i2", amountCents: money(25000) })],
    });
    const result = selectTarget([c1, c2], money(30000));
    expect(result).toEqual({ outcome: "ambiguous", candidateContractIds: ["c1", "c2"] });
  });

  it("valor bate com mais de um contrato -> ainda ambíguo (não escolhe arbitrariamente)", () => {
    const c1 = contract({
      contractId: "c1",
      installments: [installment({ id: "i1", amountCents: money(10000) })],
    });
    const c2 = contract({
      contractId: "c2",
      installments: [installment({ id: "i2", amountCents: money(10000) })],
    });
    const result = selectTarget([c1, c2], money(10000));
    expect(result).toEqual({ outcome: "ambiguous", candidateContractIds: ["c1", "c2"] });
  });

  it("parcelas já quitadas não entram no total devido do desempate", () => {
    const c1 = contract({
      contractId: "c1",
      installments: [
        installment({ id: "i1", amountCents: money(10000), paidCents: money(10000), status: "paid" }),
        installment({ id: "i1b", amountCents: money(5000) }),
      ],
    });
    const c2 = contract({
      contractId: "c2",
      installments: [installment({ id: "i2", amountCents: money(25000) })],
    });
    const result = selectTarget([c1, c2], money(5000));
    expect(result).toEqual({ outcome: "selected", contractId: "c1" });
  });
});
