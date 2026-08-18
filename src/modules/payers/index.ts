// porta pública do módulo — só o que está aqui pode ser importado de fora.
export { createPayer } from "./application/create-payer";
export type { CreatePayerDeps, CreatePayerError } from "./application/create-payer";
export type { Payer, PayerDocumentType, NewPayerInput } from "./domain/types";
export { documentHashExists, savePayer, getPayerById, listPayers } from "./infra/payer-repository";
export { identifyPayer } from "./domain/identification";
export type {
  IdentificationCandidate,
  IdentificationInput,
  IdentificationResult,
  IdentificationTier,
} from "./domain/identification";
