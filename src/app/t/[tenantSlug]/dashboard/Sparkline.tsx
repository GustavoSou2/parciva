"use client";

/**
 * Mini-gráfico de área — DESIGN.md v6 §7.3: gradiente (`dado-1`,
 * opacidade decrescente de baixo pra cima), altura fixa, sem eixo nem
 * rótulo — textura de tendência histórica, não leitura precisa. Anima
 * o traço ao entrar (GSAP `stroke-dashoffset`, mesmo gatilho de "dado
 * real acabou de chegar" já usado no gauge/check de confirmação) —
 * "vida contínua" calibrada: dispara uma vez por carregamento real do
 * dado, nunca em loop (DESIGN.md §1 princípio 5).
 */

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { usePrefersReducedMotion } from "@/ui/motion/reduced-motion";

const WIDTH = 200;
const HEIGHT = 36;
const GRADIENT_ID = "sparkline-fill";

function buildPath(values: readonly number[]): { line: string; area: string } {
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const stepX = WIDTH / Math.max(values.length - 1, 1);

  const points = values.map((v, i) => {
    const x = i * stepX;
    const y = HEIGHT - ((v - min) / range) * HEIGHT;
    return [x, y] as const;
  });

  const line = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${WIDTH},${HEIGHT} L0,${HEIGHT} Z`;
  return { line, area };
}

export function Sparkline({ values }: { values: readonly number[] }) {
  const pathRef = useRef<SVGPathElement>(null);
  const prefersReducedMotion = usePrefersReducedMotion();
  const { line, area } = buildPath(values);

  useEffect(() => {
    const path = pathRef.current;
    if (!path) return;
    const length = path.getTotalLength();
    if (prefersReducedMotion) {
      gsap.set(path, { strokeDashoffset: 0 });
      return;
    }
    gsap.fromTo(
      path,
      { strokeDasharray: length, strokeDashoffset: length },
      { strokeDashoffset: 0, duration: 0.6, ease: "power2.out" },
    );
  }, [line, prefersReducedMotion]);

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-9 w-full" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={GRADIENT_ID} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-data-1)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="var(--color-data-1)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${GRADIENT_ID})`} stroke="none" />
      <path
        ref={pathRef}
        d={line}
        fill="none"
        stroke="var(--color-data-1)"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
