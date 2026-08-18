/**
 * Geração de cronograma de parcelas — spec §14 Fase 1 ("Entregas").
 * Sem I/O. A spec não define frequência/intervalo em `contracts`
 * (nenhuma coluna para isso — só `installments_count`/`start_date`), então
 * esta é a política padrão adotada aqui, documentada como decisão: N
 * parcelas mensais iguais, primeira vencendo 1 mês após `start_date`, e
 * eventual resto de arredondamento (centavos) absorvido pela ÚLTIMA
 * parcela — nunca distribuído "no olho" nas do meio, para que a soma
 * bata exatamente com `principal_cents` (obrigatório: dinheiro nunca
 * perde nem ganha centavo no meio do caminho).
 */

import { add, money, subtract, type Money as MoneyT } from "@/shared/money";
import type { Result } from "@/shared/result";
import { err, ok } from "@/shared/result";
import type { InstallmentSchedule } from "./types";

export type GenerateScheduleError = "invalid_installments_count" | "invalid_start_date";

/**
 * Soma meses a uma data ISO (`AAAA-MM-DD`) preservando o dia quando o mês
 * de destino tem dias suficientes, e "grudando" no último dia do mês de
 * destino quando não tem (ex.: 31/jan + 1 mês → 28 ou 29/fev, nunca
 * 03/mar) — convenção usual de parcelamento, evita pular pro mês
 * seguinte por overflow do `Date` nativo.
 */
function addMonthsClamped(isoDate: string, months: number): string {
  const [year, month, day] = isoDate.split("-").map(Number) as [number, number, number];
  const totalMonths = month - 1 + months;
  const targetYear = year + Math.floor(totalMonths / 12);
  const targetMonthIndex = ((totalMonths % 12) + 12) % 12;
  const daysInTargetMonth = new Date(Date.UTC(targetYear, targetMonthIndex + 1, 0)).getUTCDate();
  const targetDay = Math.min(day, daysInTargetMonth);
  return `${targetYear}-${String(targetMonthIndex + 1).padStart(2, "0")}-${String(targetDay).padStart(2, "0")}`;
}

export function generateMonthlySchedule(
  principalCents: MoneyT,
  installmentsCount: number,
  startDate: string,
): Result<InstallmentSchedule[], GenerateScheduleError> {
  if (!Number.isInteger(installmentsCount) || installmentsCount < 1) {
    return err("invalid_installments_count");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    return err("invalid_start_date");
  }

  const base = money(Math.floor(principalCents / installmentsCount));
  const remainder = subtract(principalCents, money(base * installmentsCount));

  const schedule: InstallmentSchedule[] = [];
  for (let i = 0; i < installmentsCount; i++) {
    const isLast = i === installmentsCount - 1;
    schedule.push({
      number: i + 1,
      dueDate: addMonthsClamped(startDate, i + 1),
      amountCents: isLast ? add(base, remainder) : base,
    });
  }
  return ok(schedule);
}
