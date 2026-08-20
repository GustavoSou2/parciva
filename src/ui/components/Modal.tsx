"use client";

/**
 * PROMPT_REFATORACAO.md §3.5 — formulário de página inteira vira modal,
 * mas a rota continua existindo como deep-link. Implementado com
 * "intercepting routes" do Next.js: `@modal/(.)rota/page.tsx` intercepta
 * a navegação client-side vinda de dentro do app; abrir a URL direto
 * (ou F5) renderiza a página cheia normal em `rota/page.tsx`, sem passar
 * por este componente. `router.back()` fecha o modal restaurando a rota
 * de baixo — é por isso que fechar não é "voltar pra uma página
 * diferente", é literalmente desfazer a interceptação.
 *
 * Glass overlay + raio de cartão — DESIGN.md §1.5 item 6: modal usa a
 * MESMA escala de `rounded-card`/`shadow-card` dos cartões comuns,
 * nunca uma versão "simplificada". `backdrop-blur` é enhancement
 * progressivo (PROMPT_REFATORACAO.md linha 37/43) — sem suporte, o véu
 * fica sólido e ainda funciona.
 *
 * Responsividade (DESIGN.md v6 §9): abaixo de `--bp-sm`
 * (640px) o modal vira a própria tela — `inset: 0`, sem raio nas bordas
 * externas — em vez de flutuar centrado sobre o conteúdo de baixo, que
 * numa tela pequena sobraria só uma faixa apertada de véu ao redor.
 */

import { useEffect, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { X } from "lucide-react";
import { usePrefersReducedMotion } from "@/ui/motion/reduced-motion";

export function Modal({ children }: { children: ReactNode }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    dialogRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") router.back();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [router]);

  const motionProps = prefersReducedMotion
    ? {}
    : {
        initial: { opacity: 0, scale: 0.97, y: 8 },
        animate: { opacity: 1, scale: 1, y: 0 },
        transition: { duration: 0.18, ease: "easeOut" as const },
      };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-card-pad">
      <div
        className="absolute inset-0 bg-surface-canvas/85 backdrop-blur-md"
        onClick={() => router.back()}
        aria-hidden="true"
      />
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className="relative z-10 h-full w-full max-w-none overflow-y-auto rounded-none border-hairline border-line-hairline bg-surface-card p-card-pad shadow-card focus:outline-none sm:h-auto sm:max-w-lg sm:rounded-card"
        {...motionProps}
      >
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="Fechar"
          className="absolute top-4 right-4 rounded-control p-1 text-content-secondary transition-colors hover:bg-surface-panel hover:text-content-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          <X className="size-4" strokeWidth={1.75} />
        </button>
        {children}
      </motion.div>
    </div>
  );
}
