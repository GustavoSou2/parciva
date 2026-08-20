/**
 * Camada C (comportamento) — spec §8.1, DECISIONS.md [35]. Puro: recebe
 * agregados já buscados por `fraud/infra/behavior-repository.ts`, nunca
 * consulta o banco. Cada função aqui vira um booleano de `FraudSignals`
 * (`fraud/domain/evaluate.ts`), que sempre produz `"warn"` para estes 4
 * checks — nunca `"fail"`, nunca `FORCES_REVIEW` (são indício
 * estatístico, não prova de manipulação de arquivo).
 */

import type { Money } from "@/shared/money";

const DAY_MS = 24 * 60 * 60 * 1000;

// ── VELOCITY ──

/** Janela de "recente" usada tanto pelo repositório quanto pelo cálculo de taxa histórica. */
export const VELOCITY_WINDOW_HOURS = 24;
/** Piso absoluto — evita disparar em pagador com só 1-2 comprovantes num dia, mesmo sem histórico. */
export const VELOCITY_MIN_COUNT = 3;
/** Quantas vezes acima da taxa diária histórica conta como anomalia. */
export const VELOCITY_MULTIPLIER = 3;
/** Piso de taxa diária — sem isso, pagador sem histórico (taxa 0) dispararia com qualquer contagem > 0. */
export const VELOCITY_MIN_DAILY_RATE = 1;

export interface PayerActivityCounts {
  /** Pagamentos aceitos (`status = 'applied'`) do pagador com `createdAt` dentro da janela recente. */
  readonly recentAcceptedCount: number;
  /** Pagamentos aceitos do pagador ANTES do início da janela recente. */
  readonly priorAcceptedCount: number;
  /** `createdAt` do primeiro pagamento aceito anterior à janela — `null` se não houver nenhum. */
  readonly firstAcceptedAt: Date | null;
}

/**
 * `recentAcceptedCount` fora do padrão histórico do próprio pagador —
 * taxa diária histórica computada a partir do que veio antes da janela
 * recente (nunca inclui a própria rajada no cálculo da baseline, senão
 * a rajada "normaliza" a si mesma).
 */
export function detectVelocityAnomaly(counts: PayerActivityCounts, windowStart: Date): boolean {
  if (counts.recentAcceptedCount < VELOCITY_MIN_COUNT) return false;

  const priorDays = counts.firstAcceptedAt
    ? Math.max(1, (windowStart.getTime() - counts.firstAcceptedAt.getTime()) / DAY_MS)
    : 1;
  const historicalDailyRate = counts.priorAcceptedCount / priorDays;
  const baseline = Math.max(historicalDailyRate, VELOCITY_MIN_DAILY_RATE);

  return counts.recentAcceptedCount >= baseline * VELOCITY_MULTIPLIER;
}

// ── HISTORY ──

/** Quantas vezes acima da média das próprias parcelas conta como desproporcional. */
export const HISTORY_DISPROPORTION_MULTIPLIER = 3;

export interface NewPayerAmountInput {
  /** Total de pagamentos aceitos do pagador ANTES deste (recente + anterior). */
  readonly totalAcceptedCount: number;
  readonly amountCents: Money;
  /** Média de `installments.amountCents` entre TODOS os contratos do pagador — `null` se não houver nenhuma parcela (sem baseline, nunca inventa limiar). */
  readonly averageInstallmentCents: Money | null;
}

/**
 * Pagador sem NENHUM pagamento aceito antes deste, com valor muito acima
 * da média das próprias parcelas. Baseline vem do PRÓPRIO pagador (não
 * de outros pagadores do tenant) — por construção, quase nunca dispara
 * pro caso "primeira parcela grande de contrato novo" citado no critério
 * de aceite, porque o valor já bate com uma parcela real dele mesmo
 * (`selectTarget` garante isso antes de chegar aqui). Simplificação
 * consciente, documentada em DECISIONS.md [35].
 */
export function detectDisproportionateNewPayerAmount(input: NewPayerAmountInput): boolean {
  if (input.totalAcceptedCount > 0) return false;
  if (input.averageInstallmentCents === null) return false;
  return input.amountCents > input.averageInstallmentCents * HISTORY_DISPROPORTION_MULTIPLIER;
}

// ── AMOUNT_PATTERN ──

/** Quantos pagadores diferentes reaproveitando o mesmo valor exato conta como padrão suspeito. */
export const AMOUNT_PATTERN_MIN_DISTINCT_PAYERS = 3;
/** Janela de busca do reaproveitamento de valor — mesmo espírito da janela de `VELOCITY`, mais longa porque o sinal é tenant-wide, não por pagador. */
export const AMOUNT_PATTERN_WINDOW_DAYS = 30;

/** Distinto de `e2e_reuse` (mesmo E2E ID) — aqui é o mesmo VALOR reaproveitado por pagadores diferentes. */
export function detectAmountPatternAnomaly(distinctPayersWithSameAmountRecently: number): boolean {
  return distinctPayersWithSameAmountRecently >= AMOUNT_PATTERN_MIN_DISTINCT_PAYERS;
}

// ── PHONE_CHANGE ──

/**
 * Só é sinal quando a identificação NÃO foi por telefone (se foi, os
 * dois já batem por definição — ver `payers/domain/identification.ts`).
 * Cobre o cenário C-18 da spec: match por documento/nome com telefone de
 * origem diferente do cadastrado.
 */
export function detectPhoneChange(fromPhone: string | null, payerRegisteredPhone: string | null): boolean {
  if (!fromPhone || !payerRegisteredPhone) return false;
  return fromPhone !== payerRegisteredPhone;
}
