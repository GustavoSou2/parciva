import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Parciva",
  description: "Conciliação automática de recebíveis",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // Extensões de navegador (LanguageTool, Grammarly etc.) injetam
    // atributos em <html> antes do React hidratar — suppressHydrationWarning
    // aqui é o mitigador recomendado pela própria doc do Next.js pra esse
    // caso específico, não esconde um mismatch real de conteúdo.
    <html lang="pt-BR" suppressHydrationWarning>
      <body className="min-h-screen bg-surface-canvas font-sans text-body text-content-primary antialiased">
        {children}
      </body>
    </html>
  );
}