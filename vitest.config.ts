import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// `vitest` não carrega .env sozinho (diferente de `tsx --env-file`, usado
// pelos scripts db:migrate/db:seed/worker) — sem isso, DATABASE_URL/REDIS_URL
// caem no fallback hardcoded de src/db/client.ts (porta 5432), que não bate
// com a porta do docker-compose (55432) e faz tests/security/ falhar por
// ECONNREFUSED em vez de rodar contra o Postgres real.
if (existsSync(".env")) {
  process.loadEnvFile(".env");
}

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
