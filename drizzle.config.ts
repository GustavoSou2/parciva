import type { Config } from "drizzle-kit";

export default {
  schema: "./src/db/schema/*.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://quitou:quitou@localhost:5432/quitou_dev",
  },
} satisfies Config;
