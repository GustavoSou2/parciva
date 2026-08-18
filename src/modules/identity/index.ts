// porta pública do módulo — só o que está aqui pode ser importado de fora.
export type { MembershipRole, Permission } from "./domain/types";
export { hasPermission, requirePermission, canAutoApprove } from "./domain/authorization";
export { resolveTenantContext } from "./application/resolve-tenant-context";
export type { ResolveTenantContextDeps } from "./application/resolve-tenant-context";

export {
  deriveCsrfToken,
  generateSessionToken,
  hashSessionToken,
  sessionExpiresAt,
  verifyCsrfToken,
  SESSION_DURATION_DAYS,
} from "./domain/session";
export { validatePassword } from "./domain/password-policy";
export type { PasswordPolicyError } from "./domain/password-policy";

export { login } from "./application/login";
export type { LoginDeps, LoginError, LoginInput } from "./application/login";
export { logout } from "./application/logout";
export type { LogoutDeps } from "./application/logout";
export { requireSession } from "./application/require-session";
export type { RequireSessionDeps, RequireSessionError } from "./application/require-session";
export { inviteUser } from "./application/invite-user";
export type { InviteUserDeps, InviteUserError, InviteUserInput } from "./application/invite-user";
export { acceptInvite } from "./application/accept-invite";
export type {
  AcceptInviteDeps,
  AcceptInviteError,
  AcceptInviteInput,
} from "./application/accept-invite";

export { getUserByEmail, getUserById, createUser, setPassword, touchLastLogin } from "./infra/user-repository";
export type { UserRecord, NewUserRecord } from "./infra/user-repository";
export {
  getMembership,
  membershipExists,
  createMembership,
  acceptMembership,
  listMembershipsForUser,
} from "./infra/membership-repository";
export type { ResolvedMembership, UserTenantMembership } from "./infra/membership-repository";
export { createSession, getSessionByTokenHash, deleteSession } from "./infra/session-repository";
export { createInviteToken, getInviteByTokenHash, deleteInviteToken } from "./infra/invite-repository";
