/**
 * Dinheiro é sempre um inteiro em centavos. Nunca float, nunca decimal.
 *
 * O branded type impede que um `number` qualquer passe por dinheiro sem
 * ter sido validado por `money()`. O compilador reclama; ninguém precisa
 * lembrar da regra.
 *
 * Ver CLAUDE.md, invariante 1, e docs/adr/0003-money-as-integer-cents.md
 */

declare const brand: unique symbol;
export type Money = number & { readonly [brand]: "Money" };

export class MoneyError extends Error {}

/** Constrói um Money a partir de um inteiro em centavos. Lança se não for inteiro. */
export function money(cents: number): Money {
  if (!Number.isFinite(cents)) {
    throw new MoneyError(`Money exige número finito, recebido: ${cents}`);
  }
  if (!Number.isInteger(cents)) {
    throw new MoneyError(
      `Money exige centavos inteiros, recebido: ${cents}. ` +
        `Dinheiro nunca é float — converta a origem antes de chamar money().`,
    );
  }
  return cents as Money;
}

/** Zero, para inicialização de acumuladores sem precisar validar. */
export const ZERO: Money = money(0);

export function add(a: Money, b: Money): Money {
  return money(a + b);
}

export function subtract(a: Money, b: Money): Money {
  return money(a - b);
}

export function isNegative(a: Money): boolean {
  return a < 0;
}

export function isZero(a: Money): boolean {
  return a === 0;
}

export function min(a: Money, b: Money): Money {
  return money(Math.min(a, b));
}

export function max(a: Money, b: Money): Money {
  return money(Math.max(a, b));
}

export function sum(values: readonly Money[]): Money {
  return values.reduce((acc, v) => add(acc, v), ZERO);
}

/**
 * Converte um valor em reais (string ou number, como vem de UI/import)
 * para Money. Só ponto de entrada aceito para conversão de reais->centavos —
 * evita que cada módulo implemente sua própria multiplicação por 100.
 *
 * Rejeita valores com mais de 2 casas decimais em vez de arredondar
 * silenciosamente: arredondar dinheiro é decisão de negócio, não de parser.
 */
export function fromReais(value: string | number): Money {
  const str = typeof value === "number" ? value.toFixed(2) : value.trim();
  const match = /^-?\d+(?:[.,](\d{1,2}))?$/.exec(str.replace(",", "."));
  if (!match) {
    throw new MoneyError(`Valor em reais inválido: "${value}"`);
  }
  const normalized = str.replace(",", ".");
  const [intPart, decPart = ""] = normalized.split(".");
  const cents = Number(intPart) * 100 + Number(decPart.padEnd(2, "0"));
  return money(Math.round(cents));
}

/** Formata Money como string em reais, para exibição. Nunca use isso para cálculo. */
export function toDisplayReais(value: Money): string {
  const negative = value < 0;
  const abs = Math.abs(value);
  const reais = Math.floor(abs / 100);
  const cents = abs % 100;
  const formatted = `R$ ${reais.toLocaleString("pt-BR")},${cents.toString().padStart(2, "0")}`;
  return negative ? `-${formatted}` : formatted;
}
