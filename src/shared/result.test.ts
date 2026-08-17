import { describe, expect, it } from "vitest";
import { err, isErr, isOk, mapErr, mapOk, ok, unwrapOr } from "./result";

describe("ok()", () => {
  it("cria variante Ok com o valor", () => {
    const result = ok(42);
    expect(result).toEqual({ ok: true, value: 42 });
  });
});

describe("err()", () => {
  it("cria variante Err com o erro", () => {
    const result = err("falha");
    expect(result).toEqual({ ok: false, error: "falha" });
  });
});

describe("isOk()", () => {
  it("é true para Ok", () => {
    expect(isOk(ok(1))).toBe(true);
  });

  it("é false para Err", () => {
    expect(isOk(err("x"))).toBe(false);
  });

  it("funciona como type guard para acessar .value", () => {
    const result = ok(10);
    if (isOk(result)) {
      expect(result.value).toBe(10);
    } else {
      throw new Error("deveria ser Ok");
    }
  });
});

describe("isErr()", () => {
  it("é true para Err", () => {
    expect(isErr(err("falha"))).toBe(true);
  });

  it("é false para Ok", () => {
    expect(isErr(ok(1))).toBe(false);
  });

  it("funciona como type guard para acessar .error", () => {
    const result = err("motivo");
    if (isErr(result)) {
      expect(result.error).toBe("motivo");
    } else {
      throw new Error("deveria ser Err");
    }
  });
});

describe("mapOk()", () => {
  it("transforma o valor quando Ok", () => {
    const result = mapOk(ok(2), (n) => n * 10);
    expect(result).toEqual({ ok: true, value: 20 });
  });

  it("não executa a função e propaga o Err inalterado", () => {
    const original = err("motivo");
    const result = mapOk(original, () => {
      throw new Error("não deveria ser chamada");
    });
    expect(result).toBe(original);
  });
});

describe("mapErr()", () => {
  it("transforma o erro quando Err", () => {
    const result = mapErr(err("motivo"), (e) => `erro: ${e}`);
    expect(result).toEqual({ ok: false, error: "erro: motivo" });
  });

  it("não executa a função e propaga o Ok inalterado", () => {
    const original = ok(5);
    const result = mapErr(original, () => {
      throw new Error("não deveria ser chamada");
    });
    expect(result).toBe(original);
  });
});

describe("unwrapOr()", () => {
  it("retorna o valor quando Ok", () => {
    expect(unwrapOr(ok(7), 0)).toBe(7);
  });

  it("retorna o fallback quando Err", () => {
    expect(unwrapOr(err("motivo"), 99)).toBe(99);
  });
});
