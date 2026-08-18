/**
 * Nome do cookie de sessão — constante compartilhada entre
 * `src/middleware.ts` (runtime Edge, não pode importar nada que toque
 * banco) e as rotas de auth (runtime Node). Arquivo sem I/O de
 * propósito, pra ser seguro nos dois runtimes.
 */
export const SESSION_COOKIE_NAME = "parciva_session";
