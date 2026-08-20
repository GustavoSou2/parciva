import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { computeDelinquencyBadge } from "./delinquency";

describe("computeDelinquencyBadge", () => {
  it("sem parcela vencida ainda -> null (ausência de histórico, não recorde bom)", () => {
    expect(computeDelinquencyBadge({ dueInstallments: 0, overdueInstallments: 0 })).toBeNull();
  });

  it("nenhuma parcela vencida entre as devidas -> hasRisk false", () => {
    expect(computeDelinquencyBadge({ dueInstallments: 8, overdueInstallments: 0 })).toEqual({
      label: "atrasou 0 de 8",
      hasRisk: false,
    });
  });

  it("pelo menos uma vencida -> hasRisk true, rótulo com composição", () => {
    expect(computeDelinquencyBadge({ dueInstallments: 8, overdueInstallments: 3 })).toEqual({
      label: "atrasou 3 de 8",
      hasRisk: true,
    });
  });

  it("overdue nunca excede due (propriedade do dado, não da função) — hasRisk reflete exatamente overdue > 0", () => {
    fc.assert(
      fc.property(fc.nat({ max: 200 }), fc.nat({ max: 200 }), (due, overdue) => {
        const badge = computeDelinquencyBadge({ dueInstallments: due, overdueInstallments: overdue });
        if (due === 0) {
          expect(badge).toBeNull();
        } else {
          expect(badge?.hasRisk).toBe(overdue > 0);
          expect(badge?.label).toBe(`atrasou ${overdue} de ${due}`);
        }
      }),
    );
  });
});
