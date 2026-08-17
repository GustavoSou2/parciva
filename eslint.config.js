import path from "node:path";
import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";
import tailwind from "eslint-plugin-tailwindcss";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default [
  {
    ignores: ["node_modules/**", ".next/**", "src/db/migrations/**"],
  },
  js.configs.recommended,
  ...tseslint.configs["flat/recommended-type-checked"],
  ...tailwind.configs["flat/recommended"],
  {
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: __dirname,
      },
    },
    settings: {
      tailwindcss: {
        config: path.join(__dirname, "design/quitou.theme.css"),
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/modules/*/domain/**", "**/modules/*/infra/**"],
              message: "Importe pelo index.ts público do módulo.",
            },
          ],
        },
      ],
      "tailwindcss/no-arbitrary-value": "error",
      "tailwindcss/no-custom-classname": "error",
    },
  },
];
