import type { Money as MoneyValue } from "@/shared/money";
import { toDisplayReais } from "@/shared/money";

/**
 * Coluna de valor financeiro — spec §13.1: "usar fontFamily.num com
 * tabular figures em toda coluna de valor" e "valores sempre com sinal
 * explícito quando representarem variação". `toDisplayReais` já formata
 * o negativo com "-"; aqui só garantimos o "+" explícito no positivo
 * quando `showSign` pede variação (ex.: linha de crédito/estorno).
 */
export function Money({
  value,
  showSign = false,
}: {
  value: MoneyValue;
  showSign?: boolean;
}) {
  const display = toDisplayReais(value);
  const withSign = showSign && value > 0 ? `+${display}` : display;

  return <span className="font-num tabular-nums">{withSign}</span>;
}
