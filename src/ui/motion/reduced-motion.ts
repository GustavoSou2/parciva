"use client";

/**
 * DESIGN.md §6 — "sempre respeitar prefers-reduced-motion... sem
 * exceção". `motion/react` (Framer) já tem `<MotionConfig
 * reducedMotion="user">` pronto (aplicado uma vez em `layout.tsx`),
 * mas GSAP não tem equivalente de provider — cada coreografia GSAP
 * (`CronogramaCards.tsx`, `ActivateMfaSection.tsx`) usa este hook pra
 * decidir entre a timeline animada e o estado final instantâneo, sem
 * duplicar a lógica de `matchMedia` em cada componente.
 */

import { useEffect, useState } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

export function usePrefersReducedMotion(): boolean {
  const [prefersReduced, setPrefersReduced] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia(QUERY);
    setPrefersReduced(mediaQuery.matches);

    const onChange = (event: MediaQueryListEvent) => setPrefersReduced(event.matches);
    mediaQuery.addEventListener("change", onChange);
    return () => mediaQuery.removeEventListener("change", onChange);
  }, []);

  return prefersReduced;
}
