/**
 * Composição de fundo sutil — DESIGN.md v6 §4.6: formas orgânicas
 * desfocadas, opacidade baixa, `dado-2-soft`/`acento-soft` (nunca cor
 * saturada). Uso restrito a tela de autenticação — nunca atrás de card
 * com número/tabela (§8). Renderizado ANTES do conteúdo real no DOM
 * (`position: absolute` sem z-index compete por ordem de documento com
 * o `Card` em fluxo normal acima dele) — visível só no espaço vazio ao
 * redor do cartão, nunca por baixo dele.
 */
export function AuthBackground() {
  return (
    <>
      <div
        className="composicao-blob -top-16 -left-16 size-64 rounded-full bg-data-2-soft"
        aria-hidden="true"
      />
      <div
        className="composicao-blob -right-20 -bottom-10 size-72 rounded-full bg-accent-soft"
        aria-hidden="true"
      />
    </>
  );
}
