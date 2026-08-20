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
export { createMfaChallenge, verifyMfaChallenge, MFA_CHALLENGE_TTL_MS } from "./domain/mfa-challenge";
export {
  base32Encode,
  buildOtpauthUri,
  generateTotpCode,
  generateTotpSecret,
  verifyTotpCode,
} from "./domain/totp";
export {
  generateRecoveryCodes,
  normalizeRecoveryCode,
  RECOVERY_CODE_COUNT,
} from "./domain/recovery-codes";

export { login } from "./application/login";
export type { LoginDeps, LoginError, LoginInput, LoginResult } from "./application/login";
export { verifyMfaLogin } from "./application/verify-mfa-login";
export type {
  VerifyMfaLoginDeps,
  VerifyMfaLoginError,
  VerifyMfaLoginInput,
} from "./application/verify-mfa-login";
export { startMfaEnrollment } from "./application/start-mfa-enrollment";
export type { StartMfaEnrollmentDeps, StartMfaEnrollmentOutput } from "./application/start-mfa-enrollment";
export { confirmMfaEnrollment } from "./application/confirm-mfa-enrollment";
export type {
  ConfirmMfaEnrollmentDeps,
  ConfirmMfaEnrollmentError,
} from "./application/confirm-mfa-enrollment";
export { disableMfaWithPassword } from "./application/disable-mfa";
export type { DisableMfaDeps, DisableMfaError } from "./application/disable-mfa";
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
export { requestPasswordReset } from "./application/request-password-reset";
export type { RequestPasswordResetDeps } from "./application/request-password-reset";
export { resetPassword } from "./application/reset-password";
export type { ResetPasswordDeps, ResetPasswordError, ResetPasswordInput } from "./application/reset-password";

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
export {
  createSession,
  getSessionByTokenHash,
  deleteSession,
  deleteAllSessionsForUser,
} from "./infra/session-repository";
export { createInviteToken, getInviteByTokenHash, deleteInviteToken } from "./infra/invite-repository";
export {
  createPasswordResetToken,
  getPasswordResetByTokenHash,
  deletePasswordResetToken,
} from "./infra/password-reset-repository";
export {
  getMfaState,
  setPendingMfaSecret,
  enableMfa,
  disableMfa,
  saveRecoveryCodes,
  consumeRecoveryCode,
} from "./infra/mfa-repository";
export type { MfaState } from "./infra/mfa-repository";
