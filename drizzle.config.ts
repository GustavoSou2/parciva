import type { Config } from "drizzle-kit";

export default {
  schema: "./src/db/schema/*.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://parciva:parciva@localhost:5432/parciva_dev",
  },
} satisfies Config;
