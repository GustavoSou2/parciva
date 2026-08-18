// porta pública do módulo — só o que está aqui pode ser importado de fora.
export { registerManualPayment } from "./application/register-manual-payment";
export type {
  RegisterManualPaymentDeps,
  RegisterManualPaymentError,
} from "./application/register-manual-payment";
export { reversePayment } from "./application/reverse-payment";
export type { ReversePaymentDeps } from "./application/reverse-payment";
export { allocatePayment, owedCents } from "./domain/allocation-engine";
export type {
  AllocatableInstallment,
  AllocationKind,
  AllocationLine,
  AllocationOptions,
  AllocationResult,
  InstallmentUpdate,
  Payment,
  PaymentMethod,
  RegisterManualPaymentInput,
} from "./domain/types";
export { selectTarget } from "./domain/select-target";
export type { ContractCandidate, SelectTargetResult } from "./domain/select-target";
export {
  decideAutoApply,
  CONFIDENCE_THRESHOLD,
  FIELD_CONFIDENCE_THRESHOLD,
  MAX_PAST_DAYS,
} from "./domain/auto-apply-decision";
export type { AutoApplyDecision, AutoApplyInput } from "./domain/auto-apply-decision";
export {
  executeManualPayment,
  executeReceiptPayment,
  executeReversal,
  listPaymentsByContract,
} from "./infra/payment-repository";
export type { ReceiptPaymentInput, ReceiptPaymentOutcome } from "./infra/payment-repository";
export { createProposal, markProposalDecision } from "./infra/proposal-repository";
export type {
  NewProposal,
  ProposalDecision,
} from "./infra/proposal-repository";
export { processReceiptExtraction } from "./application/process-receipt-extraction";
export type {
  ProcessReceiptExtractionDeps,
  ProcessReceiptExtractionInput,
  ProcessReceiptExtractionResult,
} from "./application/process-receipt-extraction";
