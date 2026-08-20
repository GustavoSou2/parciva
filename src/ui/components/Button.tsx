"use client";

import type { ButtonHTMLAttributes } from "react";
import { motion } from "motion/react";
import { buttonClassName, type ButtonVariant } from "./button-class-name";

/**
 * DESIGN.md §2.3/§8: o acento vivo é reservado a confirmação em
 * movimento e ao botão de ação com IA/automação — nunca cor de botão
 * primário genérico. Botão "primary" aqui usa `surface.inverse`/
 * `content.on-inverse` (tinta sólida, texto branco), nunca acento.
 *
 * `buttonClassName` mora em `./button-class-name` (sem "use client") —
 * páginas server component importam de lá diretamente. Ver comentário
 * naquele arquivo.
 */
export { buttonClassName, type ButtonVariant };

/**
 * `motion.button` em vez de `<button>` cru — único uso de Framer Motion
 * na base de primitivos (DESIGN.md §6: "interação local, por
 * componente"), reusado em toda tela sem custo extra por página.
 * `whileTap` respeita `prefers-reduced-motion` automaticamente via
 * `<MotionConfig reducedMotion="user">` em `src/app/layout.tsx` — não
 * precisa checar aqui.
 */
// `motion.button` reinterpreta alguns handlers de evento nativos (drag/animation)
// com a própria assinatura de gesto — nenhum uso deste projeto depende deles,
// omitir evita o conflito de tipo entre o DOM nativo e a API do Framer Motion.
type NativeButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "style" | "onDrag" | "onDragStart" | "onDragEnd" | "onAnimationStart" | "onAnimationEnd"
>;

export function Button({
  variant = "primary",
  className = "",
  ...props
}: NativeButtonProps & { variant?: ButtonVariant }) {
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      transition={{ duration: 0.1 }}
      className={buttonClassName(variant, className)}
      {...props}
    />
  );
}
