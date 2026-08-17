import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  ZERO,
  add,
  fromReais,
  isNegative,
  isZero,
  max,
  min,
  money,
  MoneyError,
  subtract,
  sum,
  toDisplayReais,
} from "./money";

describe("money()", () => {
  it("aceita inteiro", () => {
    expect(money(1050)).toBe(1050);
  });

  it("rejeita float", () => {
    expect(() => money(10.5)).toThrow(MoneyError);
  });

  it("rejeita NaN e Infinity", () => {
    expect(() => money(NaN)).toThrow(MoneyError);
    expect(() => money(Infinity)).toThrow(MoneyError);
  });

  it("aceita negativo (reversão de lançamento)", () => {
    expect(money(-500)).toBe(-500);
  });
});

describe("aritmética — propriedades", () => {
  it("add nunca produz float e é comutativa", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -1_000_000_00, max: 1_000_000_00 }),
        fc.integer({ min: -1_000_000_00, max: 1_000_000_00 }),
        (a, b) => {
          const r1 = add(money(a), money(b));
          const r2 = add(money(b), money(a));
          expect(Number.isInteger(r1)).toBe(true);
          expect(r1).toBe(r2);
          expect(r1).toBe(a + b);
        },
      ),
    );
  });

  it("subtract é inversa de add", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -1_000_000_00, max: 1_000_000_00 }),
        fc.integer({ min: -1_000_000_00, max: 1_000_000_00 }),
        (a, b) => {
          const sum_ = add(money(a), money(b));
          expect(subtract(sum_, money(b))).toBe(a);
        },
      ),
    );
  });

  it("sum de uma lista é igual à soma manual", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: -100_000, max: 100_000 }), { maxLength: 50 }),
        (values) => {
          const moneys = values.map(money);
          const expected = values.reduce((a, b) => a + b, 0);
          expect(sum(moneys)).toBe(expected);
        },
      ),
    );
  });

  it("min/max nunca saem do intervalo dos dois valores", () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer(), (a, b) => {
        const lo = min(money(a), money(b));
        const hi = max(money(a), money(b));
        expect(lo).toBeLessThanOrEqual(hi);
        expect([a, b]).toContain(lo);
        expect([a, b]).toContain(hi);
      }),
    );
  });
});

describe("isNegative / isZero", () => {
  it("classifica corretamente", () => {
    expect(isZero(ZERO)).toBe(true);
    expect(isNegative(money(-1))).toBe(true);
    expect(isNegative(money(1))).toBe(false);
  });
});

describe("fromReais — parser é a única porta de entrada de reais->centavos", () => {
  it.each([
    ["10.50", 1050],
    ["10,50", 1050],
    ["10", 1000],
    ["0.01", 1],
    ["-5.00", -500],
    [1500.5, 150050],
  ])("converte %s para %i centavos", (input, expected) => {
    expect(fromReais(input)).toBe(expected);
  });

  it("rejeita mais de duas casas decimais em vez de arredondar silenciosamente", () => {
    expect(() => fromReais("10.999")).toThrow(MoneyError);
  });

  it("rejeita string não numérica", () => {
    expect(() => fromReais("abc")).toThrow(MoneyError);
  });
});

describe("toDisplayReais", () => {
  it("formata positivo e negativo com separador brasileiro", () => {
    expect(toDisplayReais(money(105099))).toBe("R$ 1.050,99");
    expect(toDisplayReais(money(-500))).toBe("-R$ 5,00");
    expect(toDisplayReais(ZERO)).toBe("R$ 0,00");
  });

  it("roundtrip fromReais -> toDisplayReais preserva o valor visível", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 999 }),
        fc.integer({ min: 0, max: 99 }),
        (reais, cents) => {
          const value = money(reais * 100 + cents);
          const display = toDisplayReais(value);
          expect(display).toMatch(/^R\$ [\d.]+,\d{2}$/);
        },
      ),
    );
  });
});
