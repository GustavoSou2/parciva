import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Geist_Mono, Inter, Schibsted_Grotesk } from "next/font/google";
import { MotionConfig } from "motion/react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Parciva",
  description: "Conciliação automática de recebíveis",
};

// DESIGN.md §3 — três vozes tipográficas, nunca uma pela outra:
// Inter (dinheiro/métrica, tabular), Schibsted Grotesk (interface/prosa),
// Geist Mono (E2E/data/timestamp/rótulo/status). As três já vêm no
// catálogo bundlado do next/font/google desta versão do Next — zero
// dependência nova, self-hosted no build (sem chamada de rede em runtime).
const uiFont = Schibsted_Grotesk({ subsets: ["latin"], variable: "--font-ui", display: "swap" });
const moneyFont = Inter({ subsets: ["latin"], variable: "--font-money", display: "swap" });
const machineFont = Geist_Mono({ subsets: ["latin"], variable: "--font-machine", display: "swap" });

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // Extensões de navegador (LanguageTool, Grammarly etc.) injetam
    // atributos em <html> antes do React hidratar — suppressHydrationWarning
    // aqui é o mitigador recomendado pela própria doc do Next.js pra esse
    // caso específico, não esconde um mismatch real de conteúdo.
    <html
      lang="pt-BR"
      suppressHydrationWarning
      className={`${uiFont.variable} ${moneyFont.variable} ${machineFont.variable}`}
    >
      <body className="min-h-screen bg-surface-canvas font-sans text-body text-content-primary antialiased">
        {/* DESIGN.md §6 — "sempre respeitar prefers-reduced-motion, sem exceção".
            reducedMotion="user" faz o motion/react (Framer) desativar/simplificar
            animações baseadas em transform automaticamente, sem checar em cada
            componente. GSAP não tem equivalente — cada coreografia GSAP usa
            `src/ui/motion/reduced-motion.ts` explicitamente. */}
        <MotionConfig reducedMotion="user">{children}</MotionConfig>
      </body>
    </html>
  );
}