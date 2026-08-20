import postgres from "postgres";
import { createPayer } from "../src/modules/payers/application/create-payer";
import { documentHashExists, savePayer } from "../src/modules/payers/infra/payer-repository";
import { createContract } from "../src/modules/contracts/application/create-contract";
import { externalRefExists, saveContractWithSchedule } from "../src/modules/contracts/infra/contract-repository";
import { money } from "../src/shared/money";
import { isErr } from "../src/shared/result";

const sql = postgres(process.env.DATABASE_URL!);
const [tenant] = await sql`select id from tenants where slug = 'ui-verify-co'`;
if (!tenant) throw new Error("tenant not found — rode o signup antes");
const ctx = { tenantId: tenant.id as string };

const payerResult = await createPayer(
  ctx,
  { name: "Fulano de Tal", document: "390.533.447-05", phoneE164: "+5511999990000" },
  {
    documentHashPepper: process.env.DOCUMENT_HASH_PEPPER!,
    documentHashExists: (hash) => documentHashExists(ctx, hash),
    savePayer: (data) => savePayer(ctx, data),
  },
);
if (isErr(payerResult)) throw new Error("createPayer: " + payerResult.error);
console.log("payerId:", payerResult.value.payerId);

const contractResult = await createContract(
  ctx,
  {
    payerId: payerResult.value.payerId,
    description: "Verificação UI — cronograma de parcelas",
    principalCents: money(300000),
    installmentsCount: 3,
    startDate: "2026-08-01",
    earlyPaymentPolicy: "credit_balance",
  },
  {
    externalRefExists: (ref) => externalRefExists(ctx, ref),
    saveContractWithSchedule: (input, schedule) => saveContractWithSchedule(ctx, input, schedule),
  },
);
if (isErr(contractResult)) throw new Error("createContract: " + contractResult.error);
console.log("contractId:", contractResult.value.contractId);

// Marca a parcela 1 como paga de verdade (pra ver o estado "liquidado"/pastel/check no cronograma)
await sql`update installments set status = 'paid', paid_cents = amount_cents where contract_id = ${contractResult.value.contractId} and number = 1`;
// Marca a parcela 2 como vencida (pra ver o estado "atraso")
await sql`update installments set status = 'overdue' where contract_id = ${contractResult.value.contractId} and number = 2`;

console.log(`\nURL: http://localhost:3100/t/ui-verify-co/contracts/${contractResult.value.contractId}`);
await sql.end();
