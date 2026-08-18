import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { money, sum } from "@/shared/money";
import { isErr, isOk } from "@/shared/result";
import { generateMonthlySchedule } from "./schedule";

describe("generateMonthlySchedule", () => {
  it("gera N parcelas com datas mensais crescentes", () => {
    const result = generateMonthlySchedule(money(30000), 3, "2026-01-15");
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.map((i) => i.dueDate)).toEqual([
        "2026-02-15",
        "2026-03-15",
        "2026-04-15",
      ]);
    }
  });

  it("soma das parcelas bate exatamente com o principal (resto vai pra última)", () => {
    const result = generateMonthlySchedule(money(1000), 3, "2026-01-01");
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.map((i) => i.amountCents)).toEqual([333, 333, 334]);
      expect(sum(result.value.map((i) => i.amountCents))).toBe(1000);
    }
  });

  it("grudas no último dia do mês quando o dia de origem não existe no destino (31/jan -> fev)", () => {
    const result = generateMonthlySchedule(money(100), 1, "2026-01-31");
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value[0]?.dueDate).toBe("2026-02-28");
    }
  });

  it("rejeita installmentsCount <= 0", () => {
    expect(isErr(generateMonthlySchedule(money(100), 0, "2026-01-01"))).toBe(true);
    expect(isErr(generateMonthlySchedule(money(100), -1, "2026-01-01"))).toBe(true);
  });

  it("rejeita data de início fora do formato ISO", () => {
    expect(isErr(generateMonthlySchedule(money(100), 1, "31/01/2026"))).toBe(true);
  });

  it("propriedade: soma das parcelas geradas sempre bate com o principal", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1_000_000_00 }),
        fc.integer({ min: 1, max: 60 }),
        fc.integer({ min: 2026, max: 2030 }),
        fc.integer({ min: 1, max: 12 }),
        fc.integer({ min: 1, max: 28 }),
        (principal, count, year, month, day) => {
          const startDate = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const result = generateMonthlySchedule(money(principal), count, startDate);
          if (isErr(result)) throw new Error("não deveria falhar para entradas válidas");
          expect(sum(result.value.map((i) => i.amountCents))).toBe(principal);
          expect(result.value).toHaveLength(count);
        },
      ),
    );
  });
});
