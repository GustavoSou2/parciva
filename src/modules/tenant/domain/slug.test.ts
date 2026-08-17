import { describe, expect, it } from "vitest";
import { generateSlug, isValidSlug } from "./slug";

describe("generateSlug", () => {
  it('"Parciva Tecnologia" → "parciva-tecnologia"', () => {
    expect(generateSlug("Parciva Tecnologia")).toBe("parciva-tecnologia");
  });

  it('"André & Cia." → "andre-cia" (acento e caractere especial)', () => {
    expect(generateSlug("André & Cia.")).toBe("andre-cia");
  });

  it("nome muito longo é truncado em 48 chars sem hífen final", () => {
    const longName =
      "Uma Empresa Muito Grande Com Nome Extremamente Longo Para Testar Truncamento De Slug";
    const slug = generateSlug(longName);

    expect(slug.length).toBeLessThanOrEqual(48);
    expect(slug.endsWith("-")).toBe(false);
  });
});

describe("isValidSlug", () => {
  it("detecta slug válido", () => {
    expect(isValidSlug("parciva-tecnologia")).toBe(true);
    expect(isValidSlug("abc123")).toBe(true);
  });

  it("rejeita slug começando ou terminando com hífen", () => {
    expect(isValidSlug("-abc")).toBe(false);
    expect(isValidSlug("abc-")).toBe(false);
  });

  it("rejeita caractere fora de [a-z0-9-]", () => {
    expect(isValidSlug("Abc-def")).toBe(false);
    expect(isValidSlug("abc_def")).toBe(false);
    expect(isValidSlug("abc def")).toBe(false);
  });

  it("rejeita fora da faixa de 3 a 48 chars", () => {
    expect(isValidSlug("ab")).toBe(false);
    expect(isValidSlug("a".repeat(49))).toBe(false);
  });
});
