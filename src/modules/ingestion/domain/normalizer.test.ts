import { describe, expect, it } from "vitest";
import { isErr, isOk } from "@/shared/result";
import { computeHash, normalizeMime } from "./normalizer";

describe("computeHash", () => {
  it("é determinístico para o mesmo buffer", () => {
    const buffer = Buffer.from("comprovante-de-teste");
    expect(computeHash(buffer)).toBe(computeHash(Buffer.from("comprovante-de-teste")));
  });

  it("muda quando o buffer muda", () => {
    const a = computeHash(Buffer.from("comprovante-a"));
    const b = computeHash(Buffer.from("comprovante-b"));
    expect(a).not.toBe(b);
  });
});

describe("normalizeMime", () => {
  it("detecta JPEG por magic bytes", () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    const result = normalizeMime(jpeg);
    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value).toBe("image/jpeg");
  });

  it("detecta PNG por magic bytes", () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
    const result = normalizeMime(png);
    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value).toBe("image/png");
  });

  it("detecta PDF por magic bytes", () => {
    const pdf = Buffer.from("%PDF-1.7\n%comprovante");
    const result = normalizeMime(pdf);
    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value).toBe("application/pdf");
  });

  it("rejeita buffer vazio", () => {
    expect(isErr(normalizeMime(Buffer.alloc(0)))).toBe(true);
  });

  it("rejeita tipo não suportado", () => {
    const text = Buffer.from("isto não é um arquivo de imagem ou pdf");
    expect(isErr(normalizeMime(text))).toBe(true);
  });
});
