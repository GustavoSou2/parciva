// porta pública do módulo — só o que está aqui pode ser importado de fora.
export type { TenantStatus, TenantTransition, TransitionEvent } from "./domain/types";
export { transition, isOperational, isReadOnly } from "./domain/lifecycle";
export { generateSlug, isValidSlug } from "./domain/slug";
export { createTenant } from "./application/create-tenant";
export type { CreateTenantDeps, CreateTenantInput, NewTenant, NewUser } from "./application/create-tenant";
