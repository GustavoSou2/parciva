/**
 * `FormData.get()` devolve `FormDataEntryValue | null` (`string | File |
 * null`) — `String(...)` direto sobre isso arriscaria virar
 * "[object Object]" se um campo de arquivo colar num nome esperado como
 * texto. Esta função é o único ponto autorizado a extrair texto de
 * `FormData` nas Server Actions deste projeto.
 */
export function formString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}
