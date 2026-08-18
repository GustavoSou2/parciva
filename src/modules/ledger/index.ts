// porta pública do módulo — só o que está aqui pode ser importado de fora.
export type { LedgerEntry, NewLedgerEntry, LedgerDirection, LedgerActorType } from "./domain/types";
export {
  writeEntry,
  writeEntryTx,
  listEntriesForPayment,
  listEntriesForContract,
} from "./infra/ledger-repository";
