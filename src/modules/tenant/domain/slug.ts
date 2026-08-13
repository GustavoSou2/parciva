/**
 * Slug do tenant — parte da URL/identificação pública, então precisa
 * ser determinístico e seguro sem depender de banco (unicidade é
 * responsabilidade de quem chama, via `slugExists` — ver
 * `application/create-tenant.ts`).
 */

const SLUG_MAX_LENGTH = 48;
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$/;
// Marcas diacríticas combinantes (acentos) isoladas por String.normalize("NFD").
const COMBINING_DIACRITICS = new RegExp("[\\u0300-\\u036f]", "g");

/**
 * Minúsculas, sem acento, espaço/caractere especial vira hífen, sem
 * hífen duplicado, no máximo 48 chars e nunca termina em hífen — a
 * truncagem em 48 pode cortar em cima de um hífen, por isso o trim
 * final é aplicado depois do slice, não só antes.
 */
export function generateSlug(name: string): string {
  const withoutAccents = name.normalize("NFD").replace(COMBINING_DIACRITICS, "");
  const slug = withoutAccents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug.slice(0, SLUG_MAX_LENGTH).replace(/-+$/g, "");
}

export function isValidSlug(slug: string): boolean {
  return SLUG_PATTERN.test(slug);
}
