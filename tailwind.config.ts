import type { Config } from "tailwindcss";
import tokens from "./design/quitou.tokens.json";

const t = tokens.theme.extend;

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    // Substitui a paleta padrão do Tailwind — não estende (setup.md
    // Parte 7.2). Sem isso, bg-blue-500/shadow-md continuariam
    // existindo ao lado dos tokens do Quitou.
    colors: t.colors,
    fontSize: t.fontSize,
    borderRadius: t.borderRadius,
    boxShadow: t.boxShadow,

    // Estende só o que faz sentido somar ao padrão do Tailwind.
    extend: {
      fontFamily: t.fontFamily,
      fontWeight: t.fontWeight,
      letterSpacing: t.letterSpacing,
      borderWidth: t.borderWidth,
      spacing: t.spacing,
      opacity: t.opacity,
    },
  },
} satisfies Config;
