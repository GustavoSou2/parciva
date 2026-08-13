// porta pública do módulo — só o que está aqui pode ser importado de fora.
export type { MembershipRole, Permission } from "./domain/types";
export { hasPermission, requirePermission, canAutoApprove } from "./domain/authorization";
export { resolveTenantContext } from "./application/resolve-tenant-context";
export type { ResolveTenantContextDeps } from "./application/resolve-tenant-context";
