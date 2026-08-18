/**
 * Motor de alocação — spec §6.4/§6.5. Puro: recebe parcelas e um valor,
 * devolve o que fazer. Nenhum I/O, nenhuma dependência de banco.
 *
 * Interpretação do §6.5 usada aqui (a spec tem uma ambiguidade real
 * entre os passos 2 e 3 — "sobra **após quitar tudo que vencia**" só
 * faz sentido se o passo 2 processar apenas parcelas VENCIDAS, não
 * todas as elegíveis): separa `due` (vencidas, `due_date <=
 * referenceDate`) de `future` (`due_date > referenceDate`); o passo 2
 * da spec percorre só `due`; a sobra do passo 3 é aplicada em `future`
 * conforme `early_payment_policy`.
 *
 * `written_off` é tratado como não-elegível, no mesmo grupo de `paid`/
 * `cancelled` — dívida baixada como perda não deveria receber alocação
 * automática (a spec não lista `written_off` explicitamente em "já
 * quitadas e canceladas", mas é a leitura mais segura).
 */

import {
  add,
  isNegative,
  isZero,
  max as moneyMax,
  min as moneyMin,
  subtract,
  ZERO,
  type Money,
} from "@/shared/money";
import type {
  AllocatableInstallment,
  AllocationLine,
  AllocationOptions,
  AllocationResult,
  InstallmentUpdate,
} from "./types";

const ELIGIBLE_STATUSES: ReadonlySet<AllocatableInstallment["status"]> = new Set([
  "pending",
  "partial",
  "overdue",
]);

function isEligible(installment: AllocatableInstallment): boolean {
  return ELIGIBLE_STATUSES.has(installment.status);
}

/**
 * `devido` da spec §6.5: `amount + fine + interest - paid`, nunca
 * negativo. Exportada porque `ledger/application/reverse-payment.ts`
 * precisa do mesmo cálculo para decidir `pending` vs `partial` depois
 * de estornar uma alocação.
 */
export function owedCents(installment: AllocatableInstallment): Money {
  const total = add(add(installment.amountCents, installment.fineCents), installment.interestCents);
  return moneyMax(ZERO, subtract(total, installment.paidCents));
}

/**
 * `paid_cents` é um valor agregado (o schema não separa quanto foi pago
 * de juros/multa/principal) — assume que TODO pagamento anterior já foi
 * aplicado na mesma ordem (juros → multa → principal), já que este é o
 * único motor que escreve `paid_cents`. Devolve o que ainda falta de
 * cada balde.
 */
function remainingByKind(installment: AllocatableInstallment): {
  interest: Money;
  fine: Money;
  principal: Money;
} {
  const paidTowardInterest = moneyMin(installment.paidCents, installment.interestCents);
  const interest = subtract(installment.interestCents, paidTowardInterest);

  const paidAfterInterest = subtract(installment.paidCents, paidTowardInterest);
  const paidTowardFine = moneyMin(paidAfterInterest, installment.fineCents);
  const fine = subtract(installment.fineCents, paidTowardFine);

  const paidAfterFine = subtract(paidAfterInterest, paidTowardFine);
  const paidTowardPrincipal = moneyMin(paidAfterFine, installment.amountCents);
  const principal = subtract(installment.amountCents, paidTowardPrincipal);

  return { interest, fine, principal };
}

/** Divide `allocatedCents` (sempre <= owedCents(installment)) em linhas juros→multa→principal. */
function splitAllocation(installment: AllocatableInstallment, allocatedCents: Money): AllocationLine[] {
  const remaining = remainingByKind(installment);
  const lines: AllocationLine[] = [];
  let left = allocatedCents;

  const interestPart = moneyMin(left, remaining.interest);
  if (!isZero(interestPart)) {
    lines.push({ installmentId: installment.id, kind: "interest", amountCents: interestPart });
    left = subtract(left, interestPart);
  }

  const finePart = moneyMin(left, remaining.fine);
  if (!isZero(finePart)) {
    lines.push({ installmentId: installment.id, kind: "fine", amountCents: finePart });
    left = subtract(left, finePart);
  }

  const principalPart = moneyMin(left, remaining.principal);
  if (!isZero(principalPart)) {
    lines.push({ installmentId: installment.id, kind: "principal", amountCents: principalPart });
    left = subtract(left, principalPart);
  }

  return lines;
}

/**
 * Aplica `available` a uma parcela: dentro da tolerância marca `paid`
 * mesmo faltando um resto (perdoado implicitamente pelo status, nunca
 * inventado como dinheiro alocado); fora da tolerância marca `partial`.
 * `consumed` é sempre `min(available, devido)` — nunca aloca mais do
 * que existe em `available`, mesmo no caso "paga dentro da tolerância"
 * (achado por teste: uma versão anterior alocava o `devido` cheio ali,
 * o que fazia `available` ficar negativo quando `devido > available`).
 */
function applyToInstallment(
  installment: AllocatableInstallment,
  available: Money,
  toleranceCents: Money,
): { lines: AllocationLine[]; update: InstallmentUpdate; consumed: Money } | null {
  const devido = owedCents(installment);
  if (isZero(devido)) return null;

  const thresholdCents = subtract(devido, toleranceCents);
  const paysInFull = available >= thresholdCents;
  const consumed = moneyMin(available, devido);
  if (isZero(consumed) || isNegative(consumed)) return null;

  return {
    lines: splitAllocation(installment, consumed),
    update: {
      installmentId: installment.id,
      newPaidCents: add(installment.paidCents, consumed),
      newStatus: paysInFull ? "paid" : "partial",
    },
    consumed,
  };
}

function byDueDateAsc(a: AllocatableInstallment, b: AllocatableInstallment): number {
  return a.dueDate.localeCompare(b.dueDate);
}

export function allocatePayment(
  installments: readonly AllocatableInstallment[],
  amountCents: Money,
  options: AllocationOptions,
): AllocationResult {
  const eligible = installments.filter(isEligible);
  const due = eligible.filter((i) => i.dueDate <= options.referenceDate).sort(byDueDateAsc);
  const future = eligible.filter((i) => i.dueDate > options.referenceDate).sort(byDueDateAsc);

  const allocations: AllocationLine[] = [];
  const installmentUpdates: InstallmentUpdate[] = [];
  let available = amountCents;

  // Passo 2 (§6.5): só parcelas vencidas, da mais antiga pra mais nova.
  for (const installment of due) {
    if (isZero(available) || isNegative(available)) break;
    const applied = applyToInstallment(installment, available, options.toleranceCents);
    if (!applied) continue;
    allocations.push(...applied.lines);
    installmentUpdates.push(applied.update);
    available = subtract(available, applied.consumed);
    if (applied.update.newStatus === "partial") break; // esgotou o disponível — nada sobra pra próxima
  }

  // Passo 3 (§6.5): sobra, só se TODAS as vencidas foram 100% quitadas.
  if (!isZero(available) && !isNegative(available)) {
    if (options.earlyPaymentPolicy === "reduce_count") {
      // Quita futuras da última para a primeira.
      for (const installment of [...future].reverse()) {
        if (isZero(available)) break;
        const applied = applyToInstallment(installment, available, options.toleranceCents);
        if (!applied) continue;
        allocations.push(...applied.lines);
        installmentUpdates.push(applied.update);
        available = subtract(available, applied.consumed);
      }
    }
    // `reduce_amount` (redistribuir o saldo entre as parcelas futuras,
    // reduzindo `amount_cents` de cada uma) é restruturação do
    // cronograma, não alocação de um pagamento — não cabe no formato de
    // `AllocationResult` deste marco. Cai em `credit_balance` como
    // comportamento seguro (nunca perde valor, só não reduz o
    // cronograma futuro automaticamente) — documentado, não escondido;
    // ver PROGRESS.md.
  }

  return { allocations, installmentUpdates, remainingCents: available };
}
