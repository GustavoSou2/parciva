/**
 * Autorização pura — sem I/O. `canAutoApprove` reflete CLAUDE.md
 * invariante 5 ("na dúvida, revisão humana"): só admin e owner podem
 * aprovar baixa automática de comprovante.
 */

import type { Result } from "@/shared/result";
import { err, ok } from "@/shared/result";
import type { MembershipRole, Permission } from "./types";
import { ROLE_PERMISSIONS } from "./types";

export function hasPermission(role: MembershipRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].has(permission);
}

export function requirePermission(
  role: MembershipRole,
  permission: Permission,
): Result<void, "unauthorized"> {
  return hasPermission(role, permission) ? ok(undefined) : err("unauthorized");
}

export function canAutoApprove(role: MembershipRole): boolean {
  return role === "owner" || role === "admin";
}
