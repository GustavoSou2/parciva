# Prompt — Refatoração de UI (Baixa Autônoma de Parcelas)

> Cole este prompt inteiro na ferramenta de codificação (Claude Code, Cursor, etc.) junto com `DESIGN.md`, `quitou_theme.css`, `quitou_tokens.json` e `style-guide.md` no contexto/repo.

---

Você é o desenvolvedor front-end responsável por refatorar a UI do produto **Baixa Autônoma de Parcelas** seguindo o `DESIGN.md` anexo como fonte de verdade. Esse documento já sintetiza dois sistemas de design herdados (`quitou.theme.css`/`quitou.tokens.json` e `style-guide.md` v3) numa direção nova. Leia `DESIGN.md` por completo antes de tocar em qualquer componente — ele resolve conflitos de paleta e forma que você não deve reabrir por conta própria.

## Objetivo

Refatorar a UI existente para a direção **"Acolhedor com Peso"**: linguagem visual amigável, cantos arredondados, mas que transmite responsabilidade e robustez de ferramenta financeira — não de app de consumo. **Importante: isso não é uma refatoração da tela de dashboard. É uma refatoração de todo o produto** — formulário, configuração, tela vazia, tela de erro, confirmação — usando a tela de dashboard só como primeiro exemplo aplicado. Isso inclui:

1. Migrar os tokens de cor/tipografia/forma para o sistema unificado do `DESIGN.md` (seção 2–4), eliminando a duplicidade `ink/mint` (Parciva) vs. `papel/tinta/grafite` (v3), **em todas as telas do repositório, não só nas que já usam cartão**.
2. Trocar os ícones atuais por um conjunto **outline** consistente (`lucide-react`), com animação apenas em transições reais de estado — nunca decorativa no mount.
3. Implementar as duas camadas de movimento definidas na seção 6: **GSAP** para coreografia de domínio, **Framer Motion (pacote `motion`)** para interação local de componente.
4. Adicionar toques visuais sutis de modernidade (detalhados abaixo) sem violar nenhuma das recusas da seção 8 do `DESIGN.md`.
5. Aplicar a checklist de **personalidade e presença** da seção 1.5 do `DESIGN.md` em toda tela — não só onde já existe cartão de parcela: número grande como hierarquia em qualquer valor central, anotação contextual em pílula em vez de legenda solta, espaço negativo generoso mesmo em telas "secundárias" (configuração, erro), presença humana (avatar) onde houver mais de uma pessoa envolvida, voz de saudação/copy pessoal no início de fluxo, e a mesma escala de raio/sombra do §4 aplicada uniformemente — incluindo modal e empty state.
6. **Transformar formulários de página inteira em modal.** Qualquer formulário que hoje ocupa uma rota própria (cadastro, edição de parcela, negociação, configuração) passa a abrir como modal sobre o contexto de onde foi acionado, em vez de navegar pra uma página nova. Use o glass sutil de overlay já definido na seção "Toques visuais sutis" abaixo (`backdrop-filter: blur(8–12px)`, fundo `papel` a 85–90%) e a mesma escala de raio de cartão (`--r-cartao`, 16px) do restante do sistema. Formulários que são o destino final de um fluxo (não uma ação pontual dentro de uma tela — ex: uma etapa de onboarding em várias telas) não precisam virar modal; use bom senso e sinalize no changelog qualquer formulário que você decidiu manter como página.

## Passo a passo

0. **Mapeamento de telas**: antes de tocar em qualquer componente, liste todas as rotas/telas do produto (dashboard, formulários, configuração, autenticação, telas vazias, telas de erro). Essa lista é o escopo real da refatoração — o `DESIGN.md` §1.5 se aplica a todas elas, não só à tela com cartões de parcela. Apresente essa lista antes de começar a editar, pra eu confirmar que nada ficou de fora.
1. **Auditoria de tokens**: liste todo uso de cor/raio/sombra hardcoded ou vindo dos tokens antigos (`ink-*`, `mint-*`, `--color-*` do theme.css). Substitua pelos tokens novos da seção 2–4 do `DESIGN.md`. Não invente hex novo fora do que está documentado — se precisar de uma variação (ex: hover), derive por opacidade/mix, não por escolha livre.
2. **Componentes de cartão** (`.kpi`, `.cartao-parcela`, `.entrada`, `.cartao-rail`, `.mini-comprovante`): aplique a escala de raio proporcional (§4) e o novo fundo pastel de estado (§2.2) nos cartões que exibem status. Confirme que nenhum cartão usa pastel como fundo de área grande fora do próprio cartão.
3. **Pílula de status**: atualize para a tabela da seção 7 (fundo pastel + texto saturado).
3.5. **Formulários → modal**: para cada formulário mapeado no passo 0 que hoje é página própria, converta para modal seguindo o padrão de glass overlay (seção "Toques visuais sutis") e a mesma escala de raio de cartão. Preserve a URL/rota como deep-link que abre o modal por cima do fundo, em vez de simplesmente remover a rota — importante pra manter compartilhamento de link e navegação por histórico do navegador funcionando.
4. **Ícones**: troque o set atual por `lucide-react`, `stroke-width: 1.75`, herdando `currentColor` do texto ao redor. Implemente as três animações de estado descritas na seção 5 (check por `dashoffset`, pulso de alerta, bounce de upload no hover) — cada uma amarrada a um evento real de mudança de estado, com fallback instantâneo sob `prefers-reduced-motion`.
5. **Motion**: 
   - GSAP para: entrada de cartão de parcela na lista (`scale 0.97→1`, `back.out(1.2)`, 220ms), varredura da régua de baixa, sequência de confirmação de pagamento.
   - Framer Motion para: hover/tap de cartão e botão, `layout` automático quando um item muda de coluna/estado, entrada e saída de modais/toasts.
   - Não duplique a mesma transição nos dois motores.
6. **Acessibilidade**: mantenha contraste mínimo (tinta/papel ≥ 17:1, grafite/papel ≥ 6,4:1), foco visível em todo elemento interativo, e respeite `prefers-reduced-motion` em toda animação nova.
7. **Revisão final**: percorra a lista de recusas (seção 8 do `DESIGN.md`) como checklist negativo antes de considerar a refatoração concluída.

## Toques visuais sutis de modernidade (adicionar com moderação)

O objetivo aqui é **textura e profundidade discretas**, não elementos que gritem "IA gerou isso". Cada item abaixo só entra se não competir com a informação financeira em primeiro plano:

- **Grão/noise muito sutil** (opacidade 2–3%) sobre o `fundo` em áreas grandes e vazias (canvas, empty states) — quebra o "chapado" do flat design sem virar textura visível à primeira vista.
- **Borda com gradiente de 1px** (não sólida) em cartões no estado hover/foco — transição suave de `linha` para `linha-forte` no próprio traço da borda, em vez de troca abrupta de cor.
- **Glass sutil só em overlay/modal**: `backdrop-filter: blur(8–12px)` com fundo semi-transparente (`papel` a 85–90%) apenas em camadas flutuantes acima do conteúdo (modal, tooltip, dropdown) — nunca no layout base.
- **Sombra em camadas, não em bloco único**: em vez de uma sombra CSS só, empilhe duas bem rasas (ex: `0 1px 2px` + `0 4px 12px` com opacidade menor na segunda) para dar sensação de elevação física sem pesar visualmente — já existe a base disso em `--sombra-cartao`, é só estender no hover.
- **Contador cinético nos valores monetários**: quando um saldo ou métrica muda, anime o número contando até o valor novo (200–400ms, easing suave) em vez de trocar instantaneamente — reforça "algo real aconteceu" sem precisar de cor extra.
- **Shimmer de carregamento** (skeleton) usando um gradiente que varre da esquerda pra direita em `linha`/`fundo`, para estados de loading de cartão — mais moderno que um spinner genérico e consistente com a paleta neutra.
- **Micro-realce de foco em campo de input**: ao focar, o `--r-campo` ganha uma sombra de anel (`box-shadow` externo, 2–3px, cor do acento a 20% de opacidade) em vez de apenas trocar a cor da borda — dá uma sensação mais "viva" sem introduzir cor saturada no texto.

Todos os itens acima devem ser implementados como *enhancement progressivo*: a interface precisa funcionar e ser legível com eles desligados (ex: `backdrop-filter` sem suporte, `prefers-reduced-motion` ativo).

## Entregáveis esperados

- Tokens de design atualizados (arquivo de tema/CSS ou tailwind config, conforme o que o repo já usa).
- Componentes de cartão, pílula e campo refatorados.
- Ícones substituídos e animações de estado implementadas.
- Curto changelog (pode ser no fim da resposta ou em `CHANGELOG.md`) listando o que foi migrado e qualquer decisão que você tomou que não estava 100% explícita no `DESIGN.md`, para eu revisar.

Se qualquer instrução aqui conflitar com o `DESIGN.md`, o `DESIGN.md` vence. Se o `DESIGN.md` for omisso em algo, prefira a opção mais conservadora (menos cor, menos movimento) e sinalize a decisão no changelog em vez de assumir silenciosamente.