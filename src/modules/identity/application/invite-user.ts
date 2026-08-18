/**
 * Convite de usuário — spec §14 Fase 0. Modelado como `membership` com
 * `accepted_at: null` (ver `db/schema/tenancy.ts`) + `invite_tokens`.
 * `deps.sendInviteEmail` é best-effort — mesmo padrão de
 * `sendWelcomeEmail` em `tenant/application/create-tenant.ts`: o
 * convite já está persistido quando o e-mail é disparado, falha no
 * envio não desfaz nada. Sem provedor de e-mail configurado no projeto
 * ainda — quem monta `deps` hoje só loga o link (dev).
 */

import type { TenantContext } from "@/db/client";
import type { Result } from "@/shared/result";
import { err, ok } from "@/shared/result";
import type { MembershipRole } from "../domain/types";

export interface InviteUserInput {
  readonly email: string;
  readonly name: string;
  readonly role: MembershipRole;
  readonly inviterUserId: string;
}

export interface InviteUserDeps {
  getUserByEmail(email: string): Promise<{ id: string } | null>;
  membershipExists(userId: string): Promise<boolean>;
  createInvitedUser(email: string, name: string): Promise<{ userId: string }>;
  createMembership(userId: string, role: MembershipRole, invitedBy: string): Promise<void>;
  createInviteToken(userId: string): Promise<{ rawToken: string; expiresAt: Date }>;
  sendInviteEmail(email: string, rawToken: string): Promise<void>;
}

export type InviteUserError = "already_member";

export async function inviteUser(
  ctx: TenantContext,
  input: InviteUserInput,
  deps: InviteUserDeps,
): Promise<Result<{ userId: string }, InviteUserError>> {
  void ctx; // deps já chegam com o tenant amarrado (infra) — mesmo padrão do resto do projeto.

  const email = input.email.trim().toLowerCase();
  const existing = await deps.getUserByEmail(email);
  if (existing && (await deps.membershipExists(existing.id))) {
    return err("already_member");
  }

  const userId = existing ? existing.id : (await deps.createInvitedUser(email, input.name)).userId;

  await deps.createMembership(userId, input.role, input.inviterUserId);
  const invite = await deps.createInviteToken(userId);

  try {
    await deps.sendInviteEmail(email, invite.rawToken);
  } catch {
    // best-effort — falha no envio não desfaz o convite.
  }

  return ok({ userId });
}
