/**
 * Convite de usuário — spec §14 Fase 0. Modelado como uma `membership`
 * criada com `accepted_at: null` (ver comentário em
 * `src/db/schema/tenancy.ts`) mais um `invite_tokens` — este arquivo só
 * cobre a parte de token, o resto é `application/invite-user.ts`.
 */

import { generateToken, hashToken } from "./token";

/** Mais curto que sessão (7 dias) de propósito — convite parado por muito tempo é superfície de ataque, não conveniência. */
export const INVITE_DURATION_DAYS = 3;

export const generateInviteToken = generateToken;
export const hashInviteToken = hashToken;

export function inviteExpiresAt(from: Date = new Date()): Date {
  return new Date(from.getTime() + INVITE_DURATION_DAYS * 24 * 60 * 60 * 1000);
}
