// porta pública do módulo — só o que está aqui pode ser importado de fora.
export { createContract } from "./application/create-contract";
export type { CreateContractDeps, CreateContractError } from "./application/create-contract";
export { generateMonthlySchedule } from "./domain/schedule";
export type {
  Contract,
  Installment,
  InstallmentStatus,
  InstallmentSchedule,
  NewContractInput,
  EarlyPaymentPolicy,
} from "./domain/types";
export {
  externalRefExists,
  saveContractWithSchedule,
  getContractById,
  getInstallmentById,
  listContracts,
  listContractsByPayer,
  listInstallmentsByContract,
  lockInstallmentsByContractTx,
  updateInstallmentTx,
} from "./infra/contract-repository";
export type { ContractSummary } from "./infra/contract-repository";
