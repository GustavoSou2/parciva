"use client";

/**
 * Tela-bandeira do refinamento de UI (DECISIONS.md) — cronograma de
 * parcelas deixa de ser tabela crua e vira lista de cartões, com uma
 * régua-resumo do progresso do contrato e dois momentos de movimento
 * reais:
 *
 * 1. Entrada em stagger quando a lista aparece (`scale 0.97→1,
 *    back.out(1.2)`, ~40ms entre cartões) — toca sempre que a lista
 *    monta, não é o caso que a recusa do DESIGN.md §8 mira (essa
 *    recusa é sobre re-tocar em toda visita SEM gatilho nenhum; aqui
 *    o gatilho é "a lista acabou de aparecer na tela").
 * 2. Check de confirmação (`stroke-dashoffset`) — só toca quando
 *    `justConfirmed` vem `true` (o servidor só manda isso logo depois
 *    de `registerPaymentAction`/`reversePaymentAction`, nunca numa
 *    visita normal) — esse sim é o gatilho de "mudança de estado de
 *    verdade" que a recusa exige.
 * 3. Contador cinético do valor pago — mesmo gatilho de (2), mesmo
 *    motor (GSAP: "entende o domínio", PROMPT_REFATORACAO.md linha 39).
 *    Conta de R$ 0,00 até o valor real em ~300ms em vez de trocar o
 *    texto instantaneamente.
 *
 * Divisão de motor (DESIGN.md §6): hover/tap do cartão usa Framer
 * Motion (`motion.li`) — interação local de componente, não do
 * domínio. A entrada em stagger e as duas animações acima usam GSAP —
 * coreografia amarrada a um evento de domínio (lista montou / parcela
 * acabou de ser confirmada).
 */

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { motion } from "motion/react";
import { Check } from "lucide-react";
import type { Installment } from "@/modules/contracts";
import { money, toDisplayReais } from "@/shared/money";
import { Money } from "@/ui/components/Money";
import { StatusChip, getCardStateBg, getStatusGroup } from "@/ui/components/StatusChip";
import { usePrefersReducedMotion } from "@/ui/motion/reduced-motion";

const RULER_SEGMENT_COLOR: Record<string, string> = {
  open: "bg-state-installment-open",
  review: "bg-state-installment-review",
  settled: "bg-state-installment-settled",
  overdue: "bg-state-installment-overdue",
};

/** Qualquer elemento SVG com geometria (path/polyline/circle/line) — os ícones do lucide-react usam formas diferentes por ícone, nunca só `<path>`. */
function geometryElements(svg: SVGSVGElement): SVGGeometryElement[] {
  return Array.from(svg.querySelectorAll("path, polyline, line, circle, rect")).filter(
    (el): el is SVGGeometryElement => typeof (el as SVGGeometryElement).getTotalLength === "function",
  );
}

export function CronogramaCards({
  installments,
  justConfirmed,
}: {
  installments: readonly Installment[];
  justConfirmed: boolean;
}) {
  const listRef = useRef<HTMLUListElement>(null);
  const prefersReducedMotion = usePrefersReducedMotion();

  // Re-tocar só quando a QUANTIDADE de cartões muda, não a cada render — evita
  // replay ao trocar de aba e voltar (dependência é deliberadamente só o length).
  useEffect(() => {
    const cards = listRef.current?.querySelectorAll<HTMLElement>("[data-cronograma-card]");
    if (!cards || cards.length === 0) return;

    if (prefersReducedMotion) {
      gsap.set(cards, { opacity: 1, scale: 1 });
      return;
    }
    gsap.fromTo(
      cards,
      { opacity: 0, scale: 0.97 },
      { opacity: 1, scale: 1, duration: 0.22, ease: "back.out(1.2)", stagger: 0.04 },
    );
  }, [installments.length]);

  useEffect(() => {
    if (!justConfirmed || prefersReducedMotion) return;

    const checkIcons = listRef.current?.querySelectorAll<SVGSVGElement>("[data-settled-check]");
    checkIcons?.forEach((svg) => {
      for (const shape of geometryElements(svg)) {
        const length = shape.getTotalLength();
        gsap.fromTo(
          shape,
          { strokeDasharray: length, strokeDashoffset: length },
          { strokeDashoffset: 0, duration: 0.28, ease: "power2.out" },
        );
      }
    });
  }, [justConfirmed, prefersReducedMotion]);

  useEffect(() => {
    if (!justConfirmed || prefersReducedMotion) return;

    const amountNodes = listRef.current?.querySelectorAll<HTMLElement>("[data-settled-amount]");
    amountNodes?.forEach((node) => {
      const targetCents = Number(node.dataset.settledAmount);
      if (!Number.isInteger(targetCents)) return;
      const proxy = { cents: 0 };
      gsap.to(proxy, {
        cents: targetCents,
        duration: 0.3,
        ease: "power2.out",
        onUpdate: () => {
          node.textContent = toDisplayReais(money(Math.round(proxy.cents)));
        },
      });
    });
  }, [justConfirmed, prefersReducedMotion]);

  return (
    <div className="flex flex-col gap-card-gap">
      {/*
        Régua-resumo: reta de propósito, sem raio (DESIGN.md v6 §1
        princípio 4 — "todo elemento arredondado tem um contraponto
        reto", a régua é esse contraponto e não pode virar mais uma
        forma arredondada igual ao cartão/pílula).
      */}
      {installments.length > 0 && (
        <div className="flex gap-px" aria-hidden="true">
          {installments.map((installment) => (
            <span
              key={installment.id}
              className={`h-1.5 flex-1 ${RULER_SEGMENT_COLOR[getStatusGroup(installment.status)]}`}
            />
          ))}
        </div>
      )}

      <ul ref={listRef} className="flex flex-col gap-card-gap">
        {installments.map((installment) => {
          const group = getStatusGroup(installment.status);
          // Só usa o placeholder "R$ 0,00" quando a animação realmente vai
          // rodar — com reduced-motion o efeito nunca contaria até o valor
          // real, e o texto ficaria travado em zero pra sempre.
          const isSettledJustNow = justConfirmed && group === "settled" && !prefersReducedMotion;
          // `exactOptionalPropertyTypes` não aceita `whileHover: undefined`
          // — quando reduced-motion está ativo, omite as props de gesto em
          // vez de passá-las como undefined (o MotionConfig global já cobre
          // isso, mas continua explícito aqui pra combinar com o GSAP acima).
          const hoverGestureProps = prefersReducedMotion
            ? {}
            : {
                whileHover: {
                  y: -2,
                  boxShadow: "0 1px 2px rgba(18,20,15,.04), 0 4px 12px -6px rgba(18,20,15,.12)",
                },
                whileTap: { scale: 0.995 },
                transition: { duration: 0.15, ease: "easeOut" as const },
              };
          return (
            <motion.li
              key={installment.id}
              data-cronograma-card
              className={`rounded-card border-hairline border-line-hairline p-card-pad shadow-card transition-colors duration-150 hover:border-line-strong ${getCardStateBg(installment.status)}`}
              {...hoverGestureProps}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-micro tracking-micro text-content-secondary uppercase">
                  Parcela {String(installment.number).padStart(2, "0")}/{installments.length} · Vence{" "}
                  {installment.dueDate}
                </span>
                {/*
                  O cartão agora carrega o mesmo pastel da pílula (DESIGN.md
                  §11) — sem esse halo branco, a pílula "some" dentro do
                  cartão de estado igual (ex.: pílula liquidado-pastel sobre
                  cartão liquidado-pastel).
                */}
                <span className="rounded-pill bg-surface-card p-0.5">
                  <StatusChip status={installment.status} />
                </span>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <span
                  className="font-num text-metric text-content-primary tabular-nums"
                  {...(isSettledJustNow ? { "data-settled-amount": installment.amountCents } : {})}
                >
                  {isSettledJustNow ? toDisplayReais(money(0)) : <Money value={installment.amountCents} />}
                </span>
                {group === "settled" && (
                  <Check data-settled-check className="size-4 text-state-installment-settled" strokeWidth={1.75} />
                )}
              </div>
              {installment.paidCents > 0 && (
                <p className="mt-1 font-mono text-aux text-content-muted">
                  Pago: <Money value={installment.paidCents} />
                </p>
              )}
            </motion.li>
          );
        })}
      </ul>
    </div>
  );
}
