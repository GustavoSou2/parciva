/**
 * Nomes de cookie compartilhados entre `src/middleware.ts` (runtime
 * Edge, não pode importar nada que toque banco/HMAC) e as rotas de auth
 * (runtime Node). Arquivo sem I/O de propósito, pra ser seguro nos dois
 * runtimes.
 */
export const SESSION_COOKIE_NAME = "parciva_session";

/**
 * Cookie CSRF (dupla submissão) — não é `httpOnly` de propósito: só
 * existe pra JS de cliente ler e ecoar de volta num header
 * (`X-Csrf-Token`) em requisição de mutação a uma API route crua
 * (Server Actions já são protegidas pelo próprio Next.js checando
 * `Origin`, decisão [16] — isso é só para `/api/**`). Valor é sempre
 * `deriveCsrfToken` (identity/domain/session.ts), nunca gerado aqui.
 */
export const CSRF_COOKIE_NAME = "parciva_csrf";
