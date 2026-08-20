"use client";

import type { ButtonHTMLAttributes } from "react";
import { motion } from "motion/react";
import { buttonClassName, type ButtonVariant } from "./button-class-name";

/**
 * DESIGN.md v6 §2.2: o acento (`#4F46E5`, indigo) agora tem papel amplo
 * de AÇÃO — botão primário, link, nav ativo, foco — sem exceção, é a
 * mesma cor em todo lugar. Isso revoga de propósito a regra v4/v5
 * ("botão primário sempre tinta/neutro", listada como derrubada em
 * §0.2) — não é suavização, é reversão completa. Botão "primary" aqui
 * usa `bg-accent`/`content.on-inverse`, nunca mais `surface.inverse`.
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
