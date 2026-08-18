import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { money, sum, ZERO } from "@/shared/money";
import { allocatePayment } from "./allocation-engine";
import type { AllocatableInstallment, AllocationOptions } from "./types";

const REFERENCE_DATE = "2026-06-15";

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

function options(overrides: Partial<AllocationOptions> = {}): AllocationOptions {
  return {
    toleranceCents: ZERO,
    earlyPaymentPolicy: "credit_balance",
    referenceDate: REFERENCE_DATE,
    ...overrides,
  };
}

describe("§6.7 — casos de borda obrigatórios (os testáveis em função pura)", () => {
  it("pagamento de R$ 0,01 a menos, dentro da tolerância -> quita", () => {
    const i = installment({ id: "i1", amountCents: money(10000) });
    const result = allocatePayment([i], money(9999), options({ toleranceCents: money(1) }));
    expect(result.installmentUpdates).toEqual([
      { installmentId: "i1", newPaidCents: 9999, newStatus: "paid" },
    ]);
    expect(result.remainingCents).toBe(0);
  });

  it("pagamento de R$ 1,00 a menos, fora da tolerância -> parcial (revisão fica a cargo da camada de aplicação)", () => {
    const i = installment({ id: "i1", amountCents: money(10000) });
    const result = allocatePayment([i], money(9900), options({ toleranceCents: ZERO }));
    expect(result.installmentUpdates).toEqual([
      { installmentId: "i1", newPaidCents: 9900, newStatus: "partial" },
    ]);
    expect(result.remainingCents).toBe(0);
  });

  it("pagamento equivalente a 3 parcelas exatas -> quita as 3 mais antigas, ignora a 4ª", () => {
    const installments = [1, 2, 3, 4].map((n) =>
      installment({ id: `i${n}`, dueDate: `2026-0${n}-01`, amountCents: money(10000) }),
    );
    const result = allocatePayment(installments, money(30000), options());
    expect(result.installmentUpdates.map((u) => u.installmentId)).toEqual(["i1", "i2", "i3"]);
    expect(result.installmentUpdates.every((u) => u.newStatus === "paid")).toBe(true);
    expect(result.remainingCents).toBe(0);
  });

  it("pagamento maior que a dívida total -> quita tudo, sobra vira remainingCents (credit_balance)", () => {
    const i = installment({ id: "i1", dueDate: "2026-01-01", amountCents: money(10000) });
    const result = allocatePayment([i], money(15000), options({ earlyPaymentPolicy: "credit_balance" }));
    expect(result.installmentUpdates).toEqual([
      { installmentId: "i1", newPaidCents: 10000, newStatus: "paid" },
    ]);
    expect(result.remainingCents).toBe(5000);
  });

  it("parcela vencida com multa configurada -> imputa juros, depois multa, depois principal", () => {
    const i = installment({
      id: "i1",
      amountCents: money(10000),
      fineCents: money(500),
      interestCents: money(200),
    });
    const result = allocatePayment([i], money(300), options());
    // Só dá pra cobrir juros (200) inteiro + parte da multa (100) — nada de principal ainda.
    expect(result.allocations).toEqual([
      { installmentId: "i1", kind: "interest", amountCents: 200 },
      { installmentId: "i1", kind: "fine", amountCents: 100 },
    ]);
  });

  it("contrato já quitado (sem parcelas elegíveis) recebe comprovante -> nada alocado, tudo vira remainingCents", () => {
    const result = allocatePayment([], money(5000), options());
    expect(result.allocations).toEqual([]);
    expect(result.installmentUpdates).toEqual([]);
    expect(result.remainingCents).toBe(5000);
  });
});

describe("early_payment_policy — sobra sobre parcelas futuras", () => {
  it("reduce_count quita futuras da última para a primeira", () => {
    const due = installment({ id: "due", dueDate: "2026-01-01", amountCents: money(10000) });
    const future1 = installment({ id: "f1", dueDate: "2026-07-01", amountCents: money(5000) });
    const future2 = installment({ id: "f2", dueDate: "2026-08-01", amountCents: money(5000) });
    const result = allocatePayment(
      [due, future1, future2],
      money(20000),
      options({ earlyPaymentPolicy: "reduce_count" }),
    );
    const ids = result.installmentUpdates.map((u) => u.installmentId);
    expect(ids).toEqual(["due", "f2", "f1"]);
    expect(result.remainingCents).toBe(0);
  });

  it("credit_balance não toca parcelas futuras", () => {
    const due = installment({ id: "due", dueDate: "2026-01-01", amountCents: money(10000) });
    const future = installment({ id: "f1", dueDate: "2026-07-01", amountCents: money(5000) });
    const result = allocatePayment(
      [due, future],
      money(20000),
      options({ earlyPaymentPolicy: "credit_balance" }),
    );
    expect(result.installmentUpdates.map((u) => u.installmentId)).toEqual(["due"]);
    expect(result.remainingCents).toBe(10000);
  });

  it("status cancelled/paid/written_off nunca recebem alocação", () => {
    const installments = [
      installment({ id: "paid", status: "paid", paidCents: money(10000) }),
      installment({ id: "cancelled", status: "cancelled" }),
      installment({ id: "written_off", status: "written_off" }),
    ];
    const result = allocatePayment(installments, money(30000), options());
    expect(result.allocations).toEqual([]);
    expect(result.remainingCents).toBe(30000);
  });
});

describe("propriedades — para qualquer sequência gerada", () => {
  const installmentArb = fc.record({
    id: fc.uuid(),
    dueDate: fc.constantFrom("2026-01-01", "2026-03-01", "2026-05-01", "2026-07-01", "2026-09-01"),
    amountCents: fc.integer({ min: 1, max: 100_000 }).map(money),
    fineCents: fc.integer({ min: 0, max: 5_000 }).map(money),
    interestCents: fc.integer({ min: 0, max: 5_000 }).map(money),
    status: fc.constantFrom<AllocatableInstallment["status"]>("pending", "partial", "overdue"),
  });

  it("a soma alocada nunca excede o valor pago", () => {
    fc.assert(
      fc.property(
        fc.array(installmentArb, { minLength: 0, maxLength: 8 }),
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.constantFrom<AllocationOptions["earlyPaymentPolicy"]>("reduce_count", "credit_balance"),
        (rawInstallments, amount, policy) => {
          const installments = rawInstallments.map((i) => installment({ ...i, paidCents: ZERO }));
          const result = allocatePayment(installments, money(amount), options({ earlyPaymentPolicy: policy }));
          const totalAllocated = sum(result.allocations.map((a) => a.amountCents));
          expect(totalAllocated).toBeLessThanOrEqual(amount);
          expect(totalAllocated + result.remainingCents).toBe(amount);
        },
      ),
    );
  });

  it("nenhuma parcela recebe mais do que devia (amount+fine+interest-paid)", () => {
    fc.assert(
      fc.property(
        fc.array(installmentArb, { minLength: 0, maxLength: 8 }),
        fc.integer({ min: 0, max: 1_000_000 }),
        (rawInstallments, amount) => {
          const installments = rawInstallments.map((i) => installment({ ...i, paidCents: ZERO }));
          const result = allocatePayment(installments, money(amount), options());
          for (const update of result.installmentUpdates) {
            const original = installments.find((i) => i.id === update.installmentId) as AllocatableInstallment;
            const devido = original.amountCents + original.fineCents + original.interestCents;
            expect(update.newPaidCents).toBeLessThanOrEqual(devido);
          }
        },
      ),
    );
  });

  it("newPaidCents nunca é negativo e nunca diminui em relação ao paidCents original (ZERO aqui)", () => {
    fc.assert(
      fc.property(
        fc.array(installmentArb, { minLength: 0, maxLength: 8 }),
        fc.integer({ min: 0, max: 1_000_000 }),
        (rawInstallments, amount) => {
          const installments = rawInstallments.map((i) => installment({ ...i, paidCents: ZERO }));
          const result = allocatePayment(installments, money(amount), options());
          for (const update of result.installmentUpdates) {
            expect(update.newPaidCents).toBeGreaterThanOrEqual(0);
          }
        },
      ),
    );
  });

  it("remainingCents nunca é negativo", () => {
    fc.assert(
      fc.property(
        fc.array(installmentArb, { minLength: 0, maxLength: 8 }),
        fc.integer({ min: 0, max: 1_000_000 }),
        (rawInstallments, amount) => {
          const installments = rawInstallments.map((i) => installment({ ...i, paidCents: ZERO }));
          const result = allocatePayment(installments, money(amount), options());
          expect(result.remainingCents).toBeGreaterThanOrEqual(0);
        },
      ),
    );
  });
});

// Casos do §6.7 que NÃO são função pura do motor — cobertos em outro
// lugar, listados aqui para rastreabilidade da tabela inteira:
// - "dois comprovantes no mesmo minuto": lock (SELECT ... FOR UPDATE),
//   ver contracts/infra/contract-repository.ts lockInstallmentsByContractTx.
// - "comprovante de data anterior à criação do contrato": validação na
//   camada de aplicação (register-manual-payment.ts), não no motor.
// - "estorno de PIX após baixa aplicada": ledger/application/reverse-payment.ts.
// - "pagou o QR e mandou o comprovante do mesmo PIX" (dedupe por
//   transaction_ref): unique index em payments + reconciliation/infra.
// - "comprovante chega antes do webhook do PSP": Fase 6/Marco 4, fora
//   de escopo do registro manual.
