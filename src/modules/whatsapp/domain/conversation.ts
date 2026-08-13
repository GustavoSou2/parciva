/**
 * Máquina de estados da conversa com o pagador — spec §9.3. Pura: sem
 * I/O, sem acesso a banco/fila/tenant. `transition` recebe o estado
 * atual e um evento, e devolve o próximo estado e, se houver, o texto
 * de resposta a enviar — quem envia (Twilio REST) é responsabilidade de
 * outra camada.
 */

export type ConversationState =
  | "idle"
  | "processing"
  | "confirmed"
  | "under_review"
  | "failed";

export type ConversationEvent =
  | { readonly type: "MEDIA_RECEIVED" }
  | { readonly type: "TEXT_RECEIVED"; readonly body: string }
  | { readonly type: "UNKNOWN_PAYER" }
  | { readonly type: "PROCESSING_DONE"; readonly automated: boolean }
  | { readonly type: "PROCESSING_FAILED" };

export interface TransitionResult {
  readonly next: ConversationState;
  readonly reply: string | null;
}

const REPLY_RECEIVED =
  "Recebemos seu comprovante. Estamos processando e retornamos em breve.";

const REPLY_TEXT_HINT =
  "Para registrar um pagamento, envie a foto ou PDF do comprovante. Dúvidas? Responda AJUDA.";

const REPLY_UNKNOWN_PAYER =
  "Não identificamos seu cadastro. Responda com seu CPF/CNPJ ou o código do contrato para continuarmos. Dúvidas? Responda AJUDA.";

const REPLY_PROCESSING_FAILED =
  "Não conseguimos processar seu comprovante. Tente enviar novamente ou responda AJUDA.";

const REPLY_HELP =
  "Um atendente foi avisado e vai te ajudar em breve. Para outro assunto, fale direto com a equipe da empresa.";

function stay(state: ConversationState): TransitionResult {
  return { next: state, reply: null };
}

/**
 * Ordem obrigatória (spec §9.3): `AJUDA` sai de qualquer estado antes
 * de qualquer outra regra — é a saída para humano que o produto exige
 * (spec §9.4). Fora isso, cada estado só reage aos eventos que a spec
 * define para ele; qualquer combinação não prevista é transição
 * inválida e mantém o estado atual sem resposta.
 */
export function transition(
  state: ConversationState,
  event: ConversationEvent,
): TransitionResult {
  if (event.type === "TEXT_RECEIVED" && event.body === "AJUDA") {
    return { next: "idle", reply: REPLY_HELP };
  }

  switch (state) {
    case "idle":
      switch (event.type) {
        case "MEDIA_RECEIVED":
          return { next: "processing", reply: REPLY_RECEIVED };
        case "TEXT_RECEIVED":
          return { next: "idle", reply: REPLY_TEXT_HINT };
        case "UNKNOWN_PAYER":
          return { next: "idle", reply: REPLY_UNKNOWN_PAYER };
        default:
          return stay(state);
      }
    case "processing":
      switch (event.type) {
        case "PROCESSING_DONE":
          return { next: event.automated ? "confirmed" : "under_review", reply: null };
        case "PROCESSING_FAILED":
          return { next: "failed", reply: REPLY_PROCESSING_FAILED };
        default:
          return stay(state);
      }
    default:
      return stay(state);
  }
}
