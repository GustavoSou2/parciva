"use client";

/**
 * Anel de progresso de métrica única — DESIGN.md v6 §7.1, distinto do
 * donut de composição banido em §8: o arco não representa fatias
 * somando 100%, representa "quanto da taxa de automação já aconteceu".
 * Arco em `--color-data-1` sobre trilho `--color-line-hairline`
 * (`.gauge-arco`/`.gauge-trilho`, quitou.theme.css) — nunca
 * `--color-accent`: cor de dado continua exclusiva de gráfico/gauge/
 * spotlight mesmo na v6, que só ampliou o PAPEL do acento (ação), não
 * abriu exceção nessa direção (§2.2/§2.3).
 *
 * Anima só uma vez, na entrada do dado real (mount com o número já
 * calculado no servidor) — não em loop, mesmo gatilho de "isso é a
 * primeira vez que este número real aparece na tela" já usado em
 * `CronogramaCards.tsx` para o stroke-dashoffset do check de confirmação.
 */

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { usePrefersReducedMotion } from "@/ui/motion/reduced-motion";

const STROKE_WIDTH = 10;
const VIEWBOX_SIZE = 100;
const RADIUS = (VIEWBOX_SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function AutomationGauge({ rate }: { rate: number | null }) {
  const arcRef = useRef<SVGCircleElement>(null);
  const prefersReducedMotion = usePrefersReducedMotion();
  const clamped = rate == null ? 0 : Math.min(1, Math.max(0, rate));
  const targetOffset = CIRCUMFERENCE * (1 - clamped);

  useEffect(() => {
    const arc = arcRef.current;
    if (!arc) return;

    if (prefersReducedMotion) {
      gsap.set(arc, { strokeDashoffset: targetOffset });
      return;
    }
    gsap.fromTo(
      arc,
      { strokeDashoffset: CIRCUMFERENCE },
      { strokeDashoffset: targetOffset, duration: 0.6, ease: "power2.out" },
    );
  }, [targetOffset, prefersReducedMotion]);

  return (
    <div className="relative flex size-36 items-center justify-center md:size-44 lg:size-52">
      <svg viewBox={`0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`} className="size-full -rotate-90">
        <circle
          className="gauge-trilho"
          cx={VIEWBOX_SIZE / 2}
          cy={VIEWBOX_SIZE / 2}
          r={RADIUS}
          fill="none"
          strokeWidth={STROKE_WIDTH}
        />
        <circle
          ref={arcRef}
          className="gauge-arco"
          cx={VIEWBOX_SIZE / 2}
          cy={VIEWBOX_SIZE / 2}
          r={RADIUS}
          fill="none"
          strokeWidth={STROKE_WIDTH}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={prefersReducedMotion ? targetOffset : CIRCUMFERENCE}
        />
      </svg>
      <span className="absolute font-num text-title text-content-primary tabular-nums sm:text-display">
        {rate == null ? "—" : `${Math.round(rate * 100)}%`}
      </span>
    </div>
  );
}
