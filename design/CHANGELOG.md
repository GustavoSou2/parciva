# Changelog — Refatoração de UI (PROMPT_REFATORACAO.md)

> Executado seguindo `DESIGN.md` (0–13, incluindo §1.5 e Anexos A/B) e `PROMPT_REFATORACAO.md` passo a passo. Este arquivo cobre só a rodada iniciada com o mapeamento de telas (passo 0) até aqui.

## Passo 0 — mapa de telas

Mapa completo já reportado no chat antes de qualquer edição: autenticação (6 telas), produto sob `/t/[tenantSlug]` (~15 telas), admin de plataforma (2 telas, fora de escopo — público diferente), raiz (`/`, placeholder de Fase 0), 5 `loading.tsx` de streaming, 0 `error.tsx`/`not-found.tsx` (gap pré-existente, não construído nesta rodada — não foi pedido).

## Passo 1 — tokens

Já migrado numa rodada anterior desta sessão (`quitou.tokens.json`/`quitou.theme.css` unificados em `papel/tinta/grafite`, sem `ink`/`mint`). Sem trabalho adicional necessário aqui.

## Passo 2 — componentes de cartão

`.cartao-parcela` (`CronogramaCards.tsx`) já seguia raio/pastel corretos. `.kpi`, `.entrada`, `.cartao-rail`, `.mini-comprovante` **não têm nenhuma tela real pra aplicar** — o produto não tem dashboard de KPI nem upload manual de comprovante (chega por WhatsApp). Não inventados (decisão confirmada com o usuário — ver "Anexo A" abaixo).

## Passo 3 — pílula de status

Já seguia a tabela §7. Ajustei `stroke-width` dos ícones de estado (`CheckCircle2`/`AlertTriangle`) pra 1.75 explícito, consistente com §5.

## Passo 3.5 — formulários → modal

Implementado com **intercepting routes** do Next.js (`@modal/(.)rota`) — a forma correta de "modal que também é deep-link": navegação client-side (clicar num `Link`) abre como modal por cima da tela de baixo; abrir a URL direto ou dar F5 renderiza a página cheia normal, sem passar pelo modal. Testado ao vivo nos dois caminhos.

Componente novo: `src/ui/components/Modal.tsx` — glass overlay (`backdrop-blur-md` + `bg-surface-canvas/85`, PROMPT_REFATORACAO.md linha 37), `rounded-card`/`shadow-card` (mesma escala de qualquer cartão, DESIGN.md §1.5 item 6), entrada via Framer Motion, fecha com Escape/clique no overlay/botão X, todos chamando `router.back()` — fechar é literalmente desfazer a interceptação, não navegar pra outro lugar.

**Convertidos pra modal** (5 — todo formulário que era página inteira dedicada a um único formulário):
- `contracts/new`, `contracts/[contractId]/edit`
- `payers/new`, `payers/[payerId]/edit`
- `statements/[importId]/lines/[lineId]` (contexto da linha + formulário, os dois dentro do mesmo modal)

Cada um foi dividido em `<Nome>Form.tsx` (conteúdo puro, sem Card/Eyebrow em volta) + `page.tsx` fino (wrap em Card pra rota cheia) + `@modal/(.)…/page.tsx` fino (wrap em `Modal`). A separação em arquivo próprio (não uma export nomeada extra em `page.tsx`) foi necessária porque o Next.js valida em tipo que `page.tsx` só pode exportar nomes que ele reconhece — uma tentativa inicial de exportar `FormContent` direto do `page.tsx` quebrou `tsc`.

**Decisão — o que NÃO virou modal:** `review/[proposalId]/page.tsx` continua página inteira. Não é "um formulário" — é um workspace de decisão (imagem do comprovante + dados extraídos + checagens de fraude + dois formulários de decisão lado a lado). Forçar isso num modal de largura fixa pioraria a tela que mais precisa de espaço no produto. Decisão minha, sinalizada aqui por não estar 100% explícita no prompt.

## Passo 4 — ícones

Já era `lucide-react` outline em todo lugar (`ErrorNote`, `StatusChip`, `CronogramaCards`, `SidebarNav`). Padronizei `stroke-width={1.75}` explícito onde faltava (antes alguns ficavam no padrão da lib, que é 2). Ícone novo: `X` no botão de fechar do `Modal`.

## Passo 5 — motion em duas camadas

- **Framer Motion** (interação local): `whileHover`/`whileTap` já existia em `Button` e nos cartões de `CronogramaCards`; adicionado agora em `Modal` (entrada/saída — exatamente o papel que DESIGN.md §6 reserva pro Framer).
- **GSAP** (coreografia de domínio): já existia (entrada em stagger, check de confirmação, contador cinético, stagger da sidebar). Nada novo neste passo além do que já estava.

## Passo 6 — checklist §1.5 aplicado às telas mapeadas

1. **Número grande como hierarquia**: aplicado em `review/[proposalId]/page.tsx` — o campo "Valor" (o número que decide aprovar/rejeitar) saiu de dentro do `<dl>` de metadados genérico e virou um bloco próprio em `text-metric`, do mesmo jeito que `CronogramaCards` já fazia com o valor da parcela.
2. **Anotação em pílula**: já é o vocabulário do `StatusChip` em todo lugar que mostra estado — nada novo necessário.
3. **Espaço generoso mesmo em telas secundárias**: auditado — toda tela já passa pelo primitivo `Card` (`p-card-pad` fixo), não existe versão "mais apertada" em nenhuma tela secundária. Nenhuma mudança necessária.
4. **Presença humana (>1 pessoa envolvida)**: não encontrei nenhuma tela do produto real onde isso se aplique hoje (o produto é tenant ↔ pagador via WhatsApp, sem UI de "múltiplas pessoas numa negociação" implementada). Não inventado.
5. **Voz de saudação no início de fluxo**: interpretação deliberada — não apliquei literalmente "Bom dia, [nome]" em cada tela. O produto já tem uma voz estabelecida (técnica, direta, en pt-BR — ver comentários de `login/page.tsx`, `ActivateMfaSection.tsx`) que contrastaria com uma saudação estilo app de consumo. Não mudei isso sem confirmar — sinalizando aqui em vez de decidir sozinho silenciosamente.
6. **Mesma escala de raio/sombra em modal e empty state**: `Modal` usa exatamente `rounded-card`/`shadow-card`, os mesmos tokens de qualquer `Card`. Empty states (ex.: "Nenhum contrato ainda...") já vivem dentro de `Card` — herdam a escala automaticamente, nada para mudar.

## Passo 7 — acessibilidade

Foco visível já tinha sido adicionado a `Input`/`Select`/`Button` numa rodada anterior. Adicionado agora ao botão de fechar do `Modal`. `prefers-reduced-motion` respeitado em toda animação nova (`Modal` usa o mesmo hook `usePrefersReducedMotion`).

## Passo 8 — checklist de recusas (§8), revisado

- Serifa: não usada em nenhum lugar. ✓
- Verde saturado em botão primário: `buttonClassName("primary")` continua `bg-surface-inverse` (tinta). ✓
- Pastel em área grande: só o cartão de parcela (emenda §12, já aprovada); canvas/sidebar continuam neutros. ✓
- Ícone preenchido fora de nav ativa: só `SidebarNav` usa `fill: currentColor`, e só no item ativo. ✓
- Donut/pizza, confete: nenhum dos dois existe. ✓
- Animação de entrada sem gatilho real: entrada em stagger (sidebar, cronograma) dispara em "a lista/menu acabou de montar" — mesmo argumento já documentado inline nos componentes; a entrada do `Modal` é gatilho real (usuário abriu o modal). ✓
- Raio acima de 16px: `--radius-card` continua 16px, nunca sobrescrito. ✓
- Dark mode: não implementado (fora de escopo, sem mudança). ✓

## Anexo A / Anexo B — decisão de escopo

Confirmado com o usuário: **não** construí a tela de Painel (KPIs + gráfico de fluxo + rail) nem os padrões de gráfico do Anexo B (waffle chart, barra empilhada, linha anotada) — nenhuma dessas telas existe hoje no produto, e criá-las seria inventar funcionalidade nova, não reestilizar o que existe. Os Anexos ficam como referência estrutural para quando/se essas telas forem encomendadas.

## Telas fora do mapeamento original

- `/admin`, `/admin/tenants` — público diferente (operador de plataforma, não tenant), não tocadas.
- `/` (raiz) — continua o placeholder de Fase 0 ("Parciva — Fase 0"), fora do sistema de design inteiramente. Não tocada porque não é uma tela real do produto ainda.
