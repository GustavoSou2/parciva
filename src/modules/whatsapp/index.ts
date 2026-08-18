// porta pública do módulo — só o que está aqui pode ser importado de fora.
export { handleInbound } from "./application/handle-inbound";
export type { HandleInboundDeps, HandleInboundError } from "./application/handle-inbound";
export type { ParsedInbound } from "./domain/types";
export { transition } from "./domain/conversation";
export type { ConversationState, ConversationEvent } from "./domain/conversation";
export { resolveTenantByPhoneNumberId } from "./infra/channel-repository";
export type { ResolvedChannel } from "./infra/channel-repository";
export { claimInboundMessage } from "./infra/inbound-repository";
