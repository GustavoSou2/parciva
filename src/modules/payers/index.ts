// porta pública do módulo — só o que está aqui pode ser importado de fora.
export { createPayer } from "./application/create-payer";
export type { CreatePayerDeps, CreatePayerError } from "./application/create-payer";
export { updatePayer } from "./application/update-payer";
export type { UpdatePayerDeps, UpdatePayerError } from "./application/update-payer";
export type { Payer, PayerDocumentType, PayerStatus, NewPayerInput } from "./domain/types";
export {
  documentHashExists,
  documentHashExistsExcluding,
  savePayer,
  savePayerUpdate,
  setPayerStatus,
  getPayerById,
  listPayers,
} from "./infra/payer-repository";
export { identifyPayer } from "./domain/identification";
export type {
  IdentificationCandidate,
  IdentificationInput,
  IdentificationResult,
  IdentificationTier,
} from "./domain/identification";
