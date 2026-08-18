import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("hashPassword / verifyPassword", () => {
  it("roundtrip: hash da senha certa verifica true", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(await verifyPassword(hash, "correct horse battery staple")).toBe(true);
  });

  it("senha errada verifica false", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(await verifyPassword(hash, "wrong password")).toBe(false);
  });

  it("mesma senha gera hashes diferentes (salt aleatório)", async () => {
    const hash1 = await hashPassword("mesma-senha");
    const hash2 = await hashPassword("mesma-senha");
    expect(hash1).not.toBe(hash2);
  });

  it("hash malformado nunca lança — só retorna false", async () => {
    await expect(verifyPassword("não-é-um-hash-argon2", "qualquer")).resolves.toBe(false);
  });

  it("hash usa o algoritmo argon2id (prefixo PHC padrão)", async () => {
    const hash = await hashPassword("senha-qualquer");
    expect(hash.startsWith("$argon2id$")).toBe(true);
  });
});
