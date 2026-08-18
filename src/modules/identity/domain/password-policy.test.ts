import { describe, expect, it } from "vitest";
import { isErr, isOk } from "@/shared/result";
import { validatePassword } from "./password-policy";

describe("validatePassword", () => {
  it("aceita senha com 8+ caracteres", () => {
    expect(isOk(validatePassword("12345678"))).toBe(true);
  });

  it("rejeita senha curta", () => {
    const result = validatePassword("1234567");
    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error).toBe("too_short");
  });

  it("rejeita string vazia", () => {
    expect(isErr(validatePassword(""))).toBe(true);
  });
});
