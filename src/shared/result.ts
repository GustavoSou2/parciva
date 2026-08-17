/**
 * Result<T, E> — retorno de função de domínio sem lançar exceção para
 * fluxo de negócio. Ver docs/quitou-spec.md §3.3: "tudo reproduzível" e
 * "determinístico antes de probabilístico" pressupõem que um caminho de
 * erro esperado (parcela não encontrada, valor divergente, etc.) é valor
 * de retorno, não `throw` — exceção fica reservada para falha de
 * infraestrutura (banco fora, rede fora), não para regra de negócio.
 */

export type Ok<T> = { readonly ok: true; readonly value: T };
export type Err<E> = { readonly ok: false; readonly error: E };
export type Result<T, E> = Ok<T> | Err<E>;

export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}

export function isOk<T, E>(result: Result<T, E>): result is Ok<T> {
  return result.ok;
}

export function isErr<T, E>(result: Result<T, E>): result is Err<E> {
  return !result.ok;
}

export function mapOk<T, E, U>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  return isOk(result) ? ok(fn(result.value)) : result;
}

export function mapErr<T, E, F>(result: Result<T, E>, fn: (error: E) => F): Result<T, F> {
  return isErr(result) ? err(fn(result.error)) : result;
}

export function unwrapOr<T, E>(result: Result<T, E>, fallback: T): T {
  return isOk(result) ? result.value : fallback;
}
