/**
 * Papéis e permissões — spec §5.1 (`memberships.role`) e §10.2
 * ("RBAC declarativo, checado no servidor em toda rota. Matriz papel ×
 * recurso × ação versionada em código e coberta por teste"). Este
 * arquivo É essa matriz.
 */

export type MembershipRole = "owner" | "admin" | "operator" | "viewer";

export type Permission =
  | "contracts:read"
  | "contracts:write"
  | "payments:read"
  | "payments:write"
  | "receipts:read"
  | "receipts:approve"
  | "members:read"
  | "members:write"
  | "settings:read"
  | "settings:write"
  | "billing:read"
  | "billing:write";

const ALL_PERMISSIONS: Permission[] = [
  "contracts:read",
  "contracts:write",
  "payments:read",
  "payments:write",
  "receipts:read",
  "receipts:approve",
  "members:read",
  "members:write",
  "settings:read",
  "settings:write",
  "billing:read",
  "billing:write",
];

export const ROLE_PERMISSIONS: Record<MembershipRole, Set<Permission>> = {
  owner: new Set(ALL_PERMISSIONS),
  admin: new Set(ALL_PERMISSIONS.filter((permission) => permission !== "billing:write")),
  operator: new Set(["contracts:read", "payments:read", "receipts:read", "receipts:approve"]),
  viewer: new Set(["contracts:read", "payments:read", "receipts:read"]),
};
