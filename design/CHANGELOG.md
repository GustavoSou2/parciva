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

---

# Rodada 2 — PROMPT_REFATORACAO_v5.md (paleta dupla, dado vs. ação, responsividade)

> Executado seguindo `DESIGN.md` 0–14 (Emendas v5: §2.3.1, §2.3.2, §2.5, §4.1, §13) e `PROMPT_REFATORACAO_v5.md` passo a passo.

## Passo 0 — mapa de telas + varredura v5

Reportado no chat antes de qualquer edição. Achado central: nenhum dos quatro padrões v5 (gauge radial, chip de ícone, spotlight, gráfico de duas séries) tinha uma tela real onde se aplicar — o produto não tinha (e nunca teve, ver Rodada 1) nenhum dashboard de KPI nem gráfico algum. Três ambiguidades foram levantadas ao usuário; a resposta ("aplique tudo, se necessário crie um dashboard") autoriza explicitamente construir o Painel (spec `docs/quitou-spec.md` §13.2, tela 1: "recebido hoje, a receber nos próximos 7 dias, fila de revisão, taxa de automação") — tela do MVP original que nunca tinha sido implementada, não uma invenção nova.

## Passo 1 — tokens

Já propagados numa rodada anterior desta sessão (`--color-data-1/2`, `--color-chip-1..3`, `--bp-sm/md/lg/xl`, `.cartao-spotlight`, `.gauge-arco`/`.gauge-trilho`, `.chip-icone`). Varredura em `src/` por hex hardcoded e por breakpoint fora do sistema de tokens: **zero ocorrências** — o único breakpoint Tailwind em todo o produto antes desta rodada era um `md:grid-cols-2` isolado em `review/[proposalId]/page.tsx`. Nada a migrar.

Adicionado nesta rodada (faltava pro Anexo A ter onde ser usado): `.cartao-rail` em `quitou.theme.css` (style-guide.md §4.5 — nunca implementada porque não existia rail nenhuma no produto) e o token de spacing `rail: 296px` (`quitou.tokens.json`/`quitou.theme.css`) — exigido pelo lint (`tailwindcss/no-arbitrary-value` rejeita `w-[296px]`).

**Observação sem ação nesta rodada:** `quitou.tokens.json` declara `theme.extend.screens` (sm/md/lg/xl), mas `tailwind.config.ts` nunca lê esse campo — os breakpoints efetivos vêm dos defaults do Tailwind, que por coincidência numérica são idênticos (640/768/1024/1280). Funciona hoje; sinalizando porque é fiação morta, não decisão deliberada.

## Passo 2 — gauge radial (§4.1)

Construído em `AutomationGauge.tsx` (Painel) para "taxa de automação" (spec §13.2 tela 1 / métrica de sucesso §15: "comprovantes processados sem intervenção > 80%") — métrica única real, não composição. Arco em `--color-data-1` sobre `--color-line-hairline` (`.gauge-arco`/`.gauge-trilho`), nunca `--color-accent`. Anima uma vez via GSAP `stroke-dashoffset` na entrada do dado real (mesmo gatilho já usado no check de confirmação de `CronogramaCards.tsx`), instantâneo sob `prefers-reduced-motion`.

Taxa calculada em `src/modules/dashboard/domain/types.ts` (`computeAutomationRate`, com teste de propriedade fast-check): `auto_applied / (auto_applied + needs_review + rejected + reviewed_approved)` — `reviewed_approved` conta no denominador (passou pela fila, não foi automático) mas nunca no numerador. `null` sem nenhuma proposta decidida ainda, mostrado como "—".

## Passo 3 — chip de ícone em lista densa (§2.3.2)

Duas tabelas qualificavam de fato (linha = entidade distinta, categoria fechada e conhecida):

- **Pagamentos** (`contracts/[contractId]/page.tsx`, coluna "Forma") — `payment_method` (enum do schema) tem **7 valores reais** (pix/ted/doc/boleto/cash/card/other), acima do máximo de 4 tons do sistema (e o sistema só define 3 tokens, `chip-1..3`). Agrupado por "como o dinheiro se move", não por decoração: `chip-1` (pix — instantâneo), `chip-2` (ted/doc/boleto — transferência/cobrança bancária), `chip-3` (cash/card/other). Nenhum tom novo inventado.
- **Linhas de extrato** (`statements/[importId]/page.tsx`, coluna "Status") — `matchKind` tem 3 categorias reais (`auto_e2e`/`manual`/sem match), cabem sem agrupamento: `chip-1` auto, `chip-2` manual, `chip-3` sem match — este último é literalmente o uso que o próprio DESIGN.md documenta pro token ("pendente de ação").

**Não aplicado** (reconfirmando o mapeamento do Passo 0): listas de contratos/pagadores usam um ícone único pra toda a lista (sem variação de categoria por linha — chip tintado não tem o que sinalizar); "Histórico de lançamentos" usa `entryType` como texto livre, sem conjunto fechado conhecido — arriscado tratar como categoria fixa sem validar o vocabulário real no banco.

## Passo 4 — cartão spotlight (§2.5)

Aplicado no Painel, fileira de KPI, cartão "Fila de revisão": **confirmação exigida pelo prompt — o card "Fila de revisão" não é saldo/dívida, é métrica de atividade** (quantos comprovantes esperam decisão humana agora). Único spotlight da tela. `Recebido hoje`/`A receber (7 dias)` ficam de fora de propósito — são valores monetários, a recusa explícita do §2.5/§8 (dashboard: nunca em cartão de saldo/dívida) se aplica mesmo sendo fluxo, não estoque, porque ainda são "o número mais sensível" do card.

## Passo 5 — gráfico de duas séries (§2.3.1)

**Não construído**, mesmo com o Painel novo autorizado. O prompt é explícito: "se for gráfico novo (tela sem gráfico hoje), não criar — isso seria inventar funcionalidade" — essa restrição vale mesmo dentro de uma tela nova, porque o gráfico em si (não a tela) é o elemento novo. O gráfico "recebimento previsto × realizado" citado em `docs/quitou-spec.md` §13.1 como aplicável ao dashboard fica registrado aqui como candidato futuro, não implementado.

## Passo 6 — responsividade (§13)

Aplicado, não só nas telas que ganharam elemento novo — decisão explícita do usuário ("aplique tudo") resolveu a ambiguidade levantada no Passo 0 (o gatilho literal do prompt, "tela tocada pelos passos 2–5", cobriria quase nada sozinho):

- **Sidebar** (`SidebarNav.tsx`) — nunca tinha nenhum breakpoint. `≥lg`: fixa expandida (228px, rótulo), inalterada. `md`–`lg`: colapsa para rail de ícones (64px, sem rótulo, sempre visível — sem drawer, cabe sem cortar conteúdo). `<md`: drawer fechado por padrão (`fixed`, `-translate-x-full` → `translate-x-0`), aberto por uma barra fixa com botão de menu (`Menu`/`X`, lucide-react) — única forma de navegar em celular, já que a sidebar deixa de ocupar espaço no fluxo. Fecha no Escape e ao trocar de rota. `layout.tsx` ganhou `pt-16 md:pt-card-pad` no `<main>` pra abrir espaço pra essa barra.
- **Painel** — grid de KPI 4 → 2 → 1 coluna (`lg`/`md`/base), `card-pad` cai pra 16px abaixo de `sm` nos 4 cards. Spotlight vira a primeira célula da coluna única abaixo de `md` (`max-md:order-first`). Gauge reduz diâmetro (`size-36`/`md:size-44`/`lg:size-52` ≈ 144/176/208px, dentro da faixa 140–240px da tabela), número central cai de `text-display` pra `text-title` abaixo de `sm`. Rail direita ocupa `w-rail` (296px) só a partir de `lg`; abaixo disso desce pra abaixo do conteúdo central, nunca escondida.
- **Modal** (`Modal.tsx`) — abaixo de `sm`: `inset: 0` de fato (`h-full w-full max-w-none rounded-none`, wrapper sem padding), sem raio nas bordas externas — vira a própria tela em vez de flutuar centrado com uma faixa apertada de véu ao redor.
- **Régua de cronograma** (`CronogramaCards.tsx`, style-guide.md §8) — **sem alteração, deliberado**: a régua já não tem `flex-wrap` (não quebra em múltiplas linhas hoje), só encolhe proporcionalmente em tela estreita — isso já satisfaz a regra ("nunca quebra em linhas"). Forçar scroll horizontal mudaria o comportamento de "resumo proporcional do cronograma inteiro" pra algo que exige rolar pra ver o final, o que é pior pro propósito do componente.

Testado nas 3 larguras pedidas (desktop ≥1280, tablet 768–1023, mobile <640) via `pnpm exec next dev` + `curl` nas rotas novas (sem Postgres disponível neste ambiente pra testar com dado real — ver nota de verificação abaixo) e leitura de cada breakpoint no código.

## Passo 7 — checklist §1.5 / acessibilidade

Drawer da sidebar fecha no Escape (mesmo padrão do `Modal`), tem `aria-label`/`aria-expanded` no botão de abrir. Nenhuma animação nova ignora `prefers-reduced-motion` (`AutomationGauge` e o `transition-transform` do drawer seguem o hook/duração condicional já padrão no projeto).

## Passo 8 — checklist de recusas (§8), revisado com os itens da v5

- Donut/pizza de composição: não construído. ✓
- Mais de um spotlight por tela: um só, no Painel. ✓
- Spotlight em card de saldo/dívida: "Recebido hoje"/"A receber" ficaram fora do spotlight de propósito (ver Passo 4). ✓
- Cor de dado (`dado-1`/`dado-2`) em botão/nav/borda: só usada no arco do gauge. ✓
- Mais de 4 tons de chip: no máximo 3 usados (é o total de tokens definidos). ✓
- Raio > 16px, verde saturado em botão primário, serifa, confete: sem alteração desde v4. ✓
- Gráfico novo inventado: não — Passo 5 explicitamente pulado mesmo com o Painel novo. ✓

## Módulo novo — `src/modules/dashboard`

Only-read, sem transação própria (nenhuma escrita): `getDashboardSummary` agrega `installments`/`payments`/`reconciliation_proposals` (import direto de `@/db/schema/financial`, mesmo padrão já justificado em `reconciliation/infra/payment-repository.ts` pra leitura que atravessa várias tabelas). `computeAutomationRate` é a única lógica pura do módulo, com teste de propriedade (fast-check) em `domain/types.test.ts` — não é lógica de dinheiro/documento (CLAUDE.md exige propriedade pra essas duas classes especificamente), mas ganhou o mesmo tratamento por ser a única conta do módulo com espaço de entrada não-trivial.

Nova rota `src/app/t/[tenantSlug]/page.tsx` — raiz do tenant nunca teve conteúdo próprio; agora redireciona pro Painel (landing natural). `SidebarNav.tsx` ganhou o item "Painel" (`LayoutDashboard`, primeiro da lista).

## Verificação — o que rodou e o que não deu pra rodar

`pnpm exec tsc --noEmit` limpo · `pnpm exec eslint src tests --ext .ts,.tsx` limpo · `node scripts/check-tokens.mjs` limpo · `pnpm exec vitest run`: 360 passaram (incluindo os 5 novos de `computeAutomationRate`), 6 suítes de `tests/security/tenant-isolation-*` falharam por `ECONNREFUSED` — não há Postgres rodando neste ambiente, pré-existente e não relacionado a esta rodada (mesmas suítes, mesmo motivo, independem do que foi tocado aqui). `pnpm exec next build` compilou com sucesso todas as rotas tocadas; falhou na etapa de "Collecting page data" de `/t/[tenantSlug]/receipts/[receiptId]/file` — rota de ingestão/armazenamento não tocada nesta rodada, erro (`path` recebendo `number`) já presente antes desta sessão. `pnpm exec next dev` + `curl` confirmaram que `/login` (200), `/t/[tenantSlug]/dashboard` e `/t/[tenantSlug]` (401 — sem sessão, não 500) compilam e executam até o ponto de autenticação sem erro de runtime; sem Postgres neste ambiente não foi possível renderizar o Painel com dado real de ponta a ponta.

---

# Rodada 3 — migração para v6 "Confiança Viva", escopo restrito (Button/SidebarNav/Painel)

> `DESIGN.md`, `quitou.tokens.json` e `quitou.theme.css` foram reescritos para v6 fora desta sessão (arquivo `style-guide.md` removido do projeto). A partir desta rodada, os três arquivos v6 são a única fonte de verdade — v4 "Acolhedor com Peso" e as Emendas v5 (Rodadas 1 e 2 deste changelog) ficam como registro histórico de decisão, não como referência vigente. Qualquer contradição com os três arquivos atuais é erro a corrigir, não estilo a preservar.
>
> Pedido explícito do usuário: varredura por resíduo do sistema antigo ANTES de editar, reportar o achado, e escopo restrito a `Button.tsx`, `SidebarNav.tsx` e o Painel — resto do produto fica pra quando for autorizado a expandir.

## Varredura — reportada ao usuário antes de qualquer edição

Nenhuma cor hex antiga (`#35D48A`) hardcoded em lugar nenhum de `src/` — o acento sempre foi referenciado por token, então a troca verde→indigo (`--color-accent`) já se propagou de graça em tudo que usa o token direto (ex.: `.cartao-spotlight`, que não precisou de nenhuma edição). O resíduo real estava nos lugares que **evitaram** o token de propósito, seguindo a regra v4/v5 revogada ("botão primário sempre neutro"):

- `button-class-name.ts` — `buttonClassName("primary")` hardcoded em `bg-surface-inverse`/`text-content-on-inverse` (tinta). Contradiz DESIGN.md v6 §2.2 (revogação registrada em §0.2).
- `Button.tsx` — comentário do cabeçalho afirmava a regra revogada como vigente ("nunca acento... botão primário genérico").
- Anel de foco `focus-visible:ring-content-primary/20` — 3 ocorrências em `SidebarNav.tsx` + 1 na classe base de `button-class-name.ts`. v6 §2.2: anel de foco também é `acento`, sem exceção.
- Item ativo da sidebar — `bg-surface-card`/`text-content-primary` (neutro). v6 §4.5 exige `acento-soft`/`acento`.
- Comentários com referência de seção morta (numeração v5, renumerada na reescrita v6): `SidebarNav.tsx` citava "§11 (emenda v4.1)", "style-guide.md §7" (arquivo removido), "§13"; `dashboard/page.tsx` citava "§2.5" pro spotlight e "style-guide.md §4.5"; `AutomationGauge.tsx` citava "§4.1 (Emenda v5)" pro gauge — §4.1 na v6 agora é "Hero de abertura", uma seção completamente diferente, então manter a referência antiga apontava pro lugar errado do documento, não só desatualizado.

**Fora do escopo autorizado, reportado e não tocado** — quebra funcional real, não só desatualização de comentário: `StatusChip.tsx` e `CronogramaCards.tsx` usam classes `bg-state-open-pastel`/`text-state-review`/`bg-state-settled`/etc. O token genérico `state.*` não existe mais em `quitou.tokens.json`/`theme.css` v6 (substituído por `state-installment.*`/`state-contract.*`, DESIGN.md §2.5) — essas classes hoje não resolvem cor nenhuma. Confirmado por lint (`tailwindcss/no-custom-classname` aponta `text-state-settled` em `CronogramaCards.tsx:187`). Isso quebra a pílula de status e a régua de cronograma visualmente até ser corrigido — primeiro candidato quando o escopo for ampliado.

## Correções aplicadas (dentro do escopo)

- **`button-class-name.ts`** — `primary`: `bg-surface-inverse` → `bg-accent hover:bg-accent-hover` (era `hover:opacity-90` sobre tinta; agora hover troca de tom de acento, mesmo padrão de `.cartao-cta`/`.cartao-spotlight`). Anel de foco da base: `ring-content-primary/20` → `ring-accent/40`. `secondary` não muda — v6 não pede isso, só o primário e o foco.
- **`Button.tsx`** — comentário reescrito para citar a revogação de fato (§0.2/§2.2) em vez de reafirmar a regra morta.
- **`SidebarNav.tsx`** — item ativo: `bg-surface-card text-content-primary` → `bg-accent-soft text-accent` (ícone continua herdando `currentColor`, então fica acento de graça). Os 3 `ring-content-primary/20` → `ring-accent/40`. Comentários de cabeçalho e dos dois blocos de responsividade atualizados pra numeração v6 (§4.5 sidebar, §9 responsividade), sem menção a "emenda"/v4.1/v5 (v6 não é mais pilha de emenda). Anotei explicitamente que agrupamento MAIN/APPS + badge de contagem (§4.5) são funcionalidade v6 nova, não resíduo — não construídos nesta rodada de correção.
- **`dashboard/page.tsx`** — três comentários realinhados: cabeçalho (referência a "Emenda v5"/"Passo 5 do PROMPT_REFATORACAO_v5.md" trocada por linguagem v6, mantendo o registro de que o gráfico de fluxo continua não construído, mesmo motivo de sempre — não inventar gráfico novo), confirmação do spotlight (§2.5→§7.2) e rail direita (style-guide.md morto removido, §13→§9). Anotei que hero de saudação (§4.1) e selo de tendência+sparkline nos KPIs (§7.3/§7.5) são pendências v6 novas, não resíduo — DESIGN.md §11 já lista como próximos passos, fora do pedido desta rodada.
- **`AutomationGauge.tsx`** — comentário do gauge: §4.1→§7.1 (na v6, §4.1 é outra seção — Hero — então a referência antiga apontava pro lugar errado do documento). Conteúdo da regra ("nunca `--color-accent`, cor de dado é exclusiva de gráfico/gauge") continua correto na v6 — só a numeração da seção estava errada, não a regra em si.
- **Nenhuma mudança de cor renderizada no Painel** além do que a troca de valor do token `--color-accent`/`--color-accent-hover` já propaga de graça (`.cartao-spotlight`, focos) — o conteúdo financeiro (KPIs, gauge, rail) já usava só tokens neutros/dado, sem resíduo de cor.

**Efeito colateral esperado, não é escopo expandido:** como `button-class-name.ts` é compartilhado, todo botão primário do produto (Registrar pagamento, Criar conta, Assinar, etc.) já fica indigo — é o efeito correto e esperado de corrigir um componente central, não uma tela nova tocada.

## Verificação

`pnpm exec tsc --noEmit` limpo · `pnpm exec eslint src --ext .ts,.tsx`: 1 erro (`text-state-settled` em `CronogramaCards.tsx`, já documentado acima, fora do escopo autorizado) · `pnpm exec vitest run`: 429/429 passaram (Postgres local subido nesta sessão via `docker compose -f infra/docker-compose.yml up -d` — as suítes de isolamento de tenant que antes falhavam por falta de banco agora passam). Verificação visual ao vivo não foi possível nesta rodada — o `next dev` de smoke-test travou num `EPERM` do Windows tentando escrever `.next/trace` (artefato de build concorrente da sessão anterior), sinalizado em vez de contornado à força matando processos que não sei identificar com segurança.

## Pendente para quando o escopo for ampliado

1. ~~`StatusChip.tsx`/`CronogramaCards.tsx` — migrar `state.*` (removido) para `state-installment.*` (§2.5).~~ Corrigido na Rodada 4, ver abaixo.
2. Vocabulário de estado de contrato/pagador (§2.5, `state-contract.*`) — tela de Contratos, conforme DESIGN.md §11 item 5.
3. Hero de saudação no Painel (§4.1), selo de tendência + sparkline nos 4 KPIs (§7.3/§7.5, DESIGN.md §11 itens 2/3).
4. Topbar com busca + seletor de tenant (§4.3), barra de filtros (§4.4), sidebar em grupos com badge (§4.5) — funcionalidade v6 nova, nenhuma tela toca isso ainda.
5. `.cartao-cta` (§4.2) — sem tela de upsell real no produto hoje; mesmo critério de sempre, não inventar até existir a tela.

---

# Rodada 4 — correção de regressão

> Escopo fechado pelo usuário: só `StatusChip.tsx` e `CronogramaCards.tsx`, só a migração de classe pontual listada no item 1 pendente da Rodada 3. Nenhum outro arquivo tocado, nenhuma outra mudança nesses dois arquivos além do necessário pra essa migração.

## O que era o erro

`quitou.tokens.json`/`quitou.theme.css` v6 renomearam o token de estado de parcela de `state.*` pra `state-installment.*` (DESIGN.md §2.5, pra abrir espaço pro vocabulário novo `state-contract.*`). `StatusChip.tsx` e `CronogramaCards.tsx` continuavam nas classes antigas (`bg-state-open-pastel`, `text-state-settled`, etc.) — como esse token não existe mais, essas classes não resolviam cor nenhuma. Confirmado pelo lint na Rodada 3 (`tailwindcss/no-custom-classname` em `CronogramaCards.tsx:187`).

## Migração — mesmo vocabulário, só o prefixo mudou

- **`StatusChip.tsx`** (`GROUP_STYLE`) — `bg-state-{open,review,settled,overdue}-pastel` → `bg-state-installment-{open,review,settled,overdue}-pastel`; `text-state-{open,review,settled,overdue}` → `text-state-installment-{open,review,settled,overdue}`. 4 pares (bg+text), nada além disso alterado no arquivo — `getStatusGroup`/`getCardStateBg`/mapeamento de `STATUS` e os comentários continuam exatamente como estavam.
- **`CronogramaCards.tsx`** — `RULER_SEGMENT_COLOR` (régua-resumo): `bg-state-{open,review,settled,overdue}` → `bg-state-installment-{open,review,settled,overdue}` (4 entradas). Ícone `Check` de parcela liquidada: `text-state-settled` → `text-state-installment-settled`. Nenhuma outra linha do arquivo tocada.

## Verificação

- `pnpm exec eslint src --ext .ts,.tsx` — **limpo**, o erro `tailwindcss/no-custom-classname` de `CronogramaCards.tsx:187` não aparece mais.
- `pnpm exec tsc --noEmit` — limpo.
- Confirmado por grep que não sobrou nenhum `state-open`/`state-review`/`state-settled`/`state-overdue` sem o prefixo `installment` nos dois arquivos.

Pendências 2–5 listadas na Rodada 3 continuam de pé, sem mudança — nenhuma foi tocada nesta rodada de propósito.

---

# Rodada 5 — aplicação inteira + arquitetura de grid (PROMPT_REFATORACAO_v6.md, Passos 0–13)

> Pré-requisito (Passo 0) confirmado antes de qualquer edição: `StatusChip.tsx`/`CronogramaCards.tsx` já migrados pra `state-installment.*` (Rodada 4).

## Passo 1 — varredura textual bruta (reportada no chat antes de editar)

Resíduo real encontrado e corrigido, repositório inteiro:
- 10 ocorrências de link de prosa (`text-content-primary hover:underline`) → `text-accent hover:underline` — `forgot-password`, `login`, `contracts/new/NewContractForm`, `payers/[payerId]`, `review/[proposalId]` (×2), `statements/page`, `statements/[importId]/page`, `statements/.../lines/[lineId]/StatementLineForm` (×2).
- 2 anéis de foco `ring-content-primary/20` → `ring-accent/40` (`Modal.tsx`, `Input.tsx` — este último é a classe base de todo campo do produto).
- 7 citações mortas realinhadas para numeração v6 (`layout.tsx`, `contracts/page.tsx`, `CronogramaCards.tsx` ×2, `statements/[importId]/page.tsx`, `Modal.tsx`, `contracts/[contractId]/page.tsx`) — `style-guide.md`/`Emenda v5`/seções renumeradas.
- `bg-surface-inverse` fora de contexto neutro: 0 ocorrências — já limpo desde a Rodada 3.
- Ambiguidade "cartão inteiro é link" (Contratos/Pagadores/Revisão/rail do Painel) e tela de detalhe único (Contrato/Pagador): resolvidas pelo usuário e registradas em `DESIGN.md` §2.2 (cartão-link não é "link" pra fins de acento) e §4.7.1 (versão leve do bento pra detalhe de uma entidade).

## Passo 2 — mapa de telas por arquitetura (§4.7), reportado antes de editar

**Tem dado agregável** (ganharam camada de resumo/bento): Painel (bento completo), Contratos, Pagadores, Fila de revisão, Extratos (lista + detalhe de um import) — resumo mínimo (2–3 números, reduce sobre a lista já buscada, nenhuma query nova, exceto onde sinalizado abaixo).
**Detalhe de entidade única, versão leve do §4.7.1**: Contrato (`contracts/[contractId]`), Pagador (`payers/[payerId]`).
**Camada única, sem resumo** (confirmado, não forçado): login, signup, forgot-password, reset-password, invite, account/security, contracts/new, contracts/[id]/edit, payers/new, payers/[id]/edit, statements/.../lines/[lineId], review/[proposalId] (workspace de decisão, não lista). Os 5 modais em `@modal/(.)...` seguem a classificação da rota base.
**Fora de escopo, confirmado desde a Rodada 1**: `/admin`, `/admin/tenants`, `/` raiz.

## Passo 3 — grid bento + resumos mínimos

- **Painel** — migrado de grid uniforme 4 colunas pra bento assimétrico 12 colunas (`col-start`/`col-span`/`row-span`, utilitários padrão do Tailwind): "Recebido hoje" domina (`col-span-5 row-span-2`, com sparkline+selo de tendência), "Taxa de automação" (gauge) no canto oposto (`col-span-3 row-span-2`), "A receber"/"Fila de revisão" no meio, um por linha. Nunca os 4 do mesmo tamanho.
- **Contratos/Pagadores/Fila de revisão/Extratos** (lista e detalhe de import) — resumo mínimo de 2–3 números acima da lista, sempre `reduce` sobre o array já buscado pra renderizar a lista/tabela em si (`listContracts`/`listPayers`/`listProposalsByDecision`+`getReceiptWithExtraction`/`listStatementImports`/`getStatementLinesByImport`) — nenhuma query nova nesta camada.

## Passo 4 — hero + CTA

- **Hero** (§4.1): construído só no Painel — saudação por horário real (`Intl.DateTimeFormat`, fuso fixo `America/Sao_Paulo` — 100% dos tenants nascem nesse fuso hoje, sem UI pra trocar; virar bloqueio real se isso deixar de ser verdade, não decoração), primeiro nome do usuário (`getUserById`), sem fundo próprio.
- **CTA de upsell** (§4.2): **não construído**. O Painel já tem um spotlight ("Fila de revisão") ocupando o único slot de destaque permitido por tela — `.cartao-cta`/`.cartao-spotlight` nunca podem coexistir (§4.2/§7.2). O upgrade de plano já tem caminho real em `/account`, fora desse slot; não há outra tela de upsell no produto.

## Passo 5 — topbar, filtros, sidebar robusta

- **Topbar** (`Topbar.tsx`, novo) — seletor de tenant real (`listMembershipsForUser`, sempre visível, nunca em menu secundário), ícone de configurações (`/account/security`), menu de usuário (nome + sair, movido da sidebar pra aqui).
- **Bloqueios reportados, não simulados**: busca ("Buscar contratos, pagadores...") exigiria consulta textual nova entre `contracts`/`payers` que não existe hoje — construir busca só sobre o que já está na tela mentiria sobre o que a busca promete; notificação (sino) não tem conceito de "não lido" no produto — um badge sem contagem real violaria a própria regra do sistema (§5). Os dois ficaram de fora do `Topbar.tsx`, sinalizados no comentário do arquivo.
- **Filtros** (§4.4): nenhuma tela do produto tem filtro de usuário real hoje pra converter em chip — fila de revisão e extrato filtram implicitamente no código (`decision === "needs_review"`, `matchKind === null`), não são um controle que o usuário opera. Não inventado.
- **Sidebar** (`SidebarNav.tsx`) — reagrupada em Principal/Operação/Conta (`label-micro`), "Segurança"/"Sair" saíram de lá (agora no menu de usuário do Topbar). Badge de contagem real (`countProposalsByDecision`, nova consulta só de contagem — não reusa `listProposalsByDecision` porque isso rodaria em TODA página do tenant via `layout.tsx`, não só `/review`) em "Revisão", variante `--urgente` (vermelho) — é literalmente o exemplo do próprio DESIGN.md pra esse badge. Nenhum outro item ganhou badge (nenhum outro tem contagem real).

## Passo 6 — composição sutil (§4.6)

Aplicada em exatamente dois lugares, confirmando por escrito que nenhum ficou atrás de card com número/tabela:
- **5 telas de autenticação** (`AuthBackground.tsx`, novo componente compartilhado) — 2 blobs no canto, atrás do formulário; o `Card` (fundo opaco `surface-card`) cobre qualquer sobreposição, mesma técnica em todas as 5.
- **Hero do Painel** — 1 blob atrás do texto de saudação; o grid bento abaixo (todos os cards com `bg-surface-card` opaco) cobre qualquer vazamento visual, mesma técnica.
Nenhuma outra tela — empty states do produto são uma linha de texto dentro de um `<p>`, não um layout dedicado; aplicar blob ali decoraria uma frase, não um espaço vazio real. Sinalizado, não construído.

## Passo 7 — vocabulário de estado de contrato/pagador (§2.5)

Novo em `StatusChip.tsx`: `ContractStatusChip`/`getContractCardBg` e `PayerStatusChip`/`getPayerCardBg`, tokens `state-contract-*`. Aplicado em `contracts/page.tsx`, `contracts/[contractId]/page.tsx`, `payers/page.tsx`, `payers/[payerId]/page.tsx` — substitui o reaproveitamento incorreto do vocabulário de PARCELA que essas telas usavam antes (contrato "cancelled" pintava vermelho de `state-installment-overdue`; devia ser neutro de "encerrado"). Só `ativo`/`encerrado`(`inativo`) implementados — são os únicos valores que o schema de fato grava hoje; `suspenso`/`inadimplente` existem no vocabulário de cor mas não têm estado real no banco, não inventados.

## Passo 8 — vida nas telas (§7.1–7.6)

- **Selo de tendência + sparkline**: só em "Recebido hoje" (vs. ontem) e "Taxa de automação" (vs. semana anterior, janela própria — `automationRateCurrentWindow`/`automationRatePreviousWindow`, distinta do `automationRate` vitalício que alimenta o gauge). "A receber" (janela futura, sem "período anterior" com sentido) e "Fila de revisão" (profundidade de fila ao vivo, não dado decidido) não ganharam selo — comparação sem sentido semântico não é comparação, é decoração. Sparkline só em "Recebido hoje" (14 dias, `receivedDailySeries`, dias sem pagamento preenchidos com zero, nunca omitidos).
- **Gauge**: inalterado (já era métrica única real desde a Rodada 2).
- **Spotlight**: inalterado, um só, "Fila de revisão".
- **Chip de ícone tintado**: inalterado (já aplicado em Pagamentos/linhas de extrato desde a Rodada 2) — nenhuma lista nova qualificou nesta rodada.
- **Ranking com medalha** (§7.6): **não construído** — não existe nenhuma lista real ordenada por valor no produto hoje (top pagadores, top contratos por valor) pra aplicar; mesmo critério de sempre, não inventar lista só pra ter onde usar o componente.

## Passo 9 — gráficos ricos (§7.7)

**Não construído.** Nenhum gráfico existia em nenhuma tela antes desta rodada — comparação/projeção/histórico exigiriam criar um gráfico do zero, e isso é exatamente a recusa que atravessa todas as rodadas desde a v5 ("gráfico novo... seria inventar funcionalidade"). Sinalizado como candidato futuro, não implementado.

## Passo 10 — calibração de movimento (§1 princípio 5)

Revisado item por item contra o teste "se o dado não mudasse, a tela ainda estaria se movendo?": stagger de sidebar/`CronogramaCards` (gatilho: lista montou), check/contador (gatilho: `justConfirmed`), gauge/sparkline (gatilho: dado real chegou no primeiro render) — todos com gatilho real, nenhum novo introduzido sem um. `--live-dot` não usado em lugar nenhum (nenhum polling/websocket real no produto) — omissão correta, não gap.

## Passo 11 — responsividade completa (§9)

Grid bento colapsa 12→6→1 coluna (`lg:`/`md:`/base), hero sempre primeiro no DOM (garante ordem em mobile sem depender de `order-*`). Topbar: nome de tenant/usuário truncam (`max-w-24 truncate sm:max-w-none`) pra não quebrar em telas muito estreitas — texto continua visível (com "…"), nunca omitido por completo. Sidebar/Modal: inalterados desde a Rodada 2 (já cobriam §9).

## Passo 12 — checklist de recusas (§8)

- Botão primário neutro / ícone colorido banido em KPI: revogado corretamente, nada reafirma a regra antiga. ✓
- Grid bento com todos os cards do mesmo tamanho: não — spans assimétricos. ✓
- Camada de resumo forçada em formulário/configuração: nenhuma tocada. ✓
- Composição sutil atrás de card com dado: nenhuma ocorrência (Passo 6). ✓
- `dado-3` fora de funil de 3 estágios / cor própria pra projeção: nenhum dos dois construído (sem gráfico nesta rodada). ✓
- Seletor de tenant escondido: sempre visível na topbar. ✓
- Movimento sem gatilho real: nenhum novo. ✓
- Mais de um cartão de destaque por tela: um só no Painel, nunca junto com CTA. ✓
- Raio > 16px, donut, confete, serifa, dark mode: sem alteração desde v4. ✓

## Novo módulo/arquivos desta rodada

`src/modules/dashboard`: `computeTrend` (domínio puro, com teste de propriedade fast-check), `sumAppliedPayments`/`decisionCountsInRange` (helpers de repositório), série diária pro sparkline, contagem de automação por janela. `src/modules/reconciliation`: `countProposalsByDecision` (só contagem, pro badge da sidebar sem carregar linhas inteiras em toda página). `Topbar.tsx`, `AuthBackground.tsx`, `Sparkline.tsx`, `TrendBadge.tsx` (novos componentes).

## Verificação — estática ✓, visual ao vivo BLOQUEADA (rodada não fecha sem isso, ver abaixo)

- `pnpm exec tsc --noEmit` — limpo.
- `pnpm exec eslint src --ext .ts,.tsx` — limpo.
- `pnpm exec vitest run` — 434/434 passaram (1 falha de `confirm-mfa-enrollment.test.ts` numa rodada isolada, confirmada como flaky de janela de TOTP — passa sozinho, passa de novo na suíte completa em seguida; não relacionado a nada tocado nesta rodada).
- **`next dev` — não confirmado rodando.** Múltiplas tentativas (portas 3413, 3414) travaram indefinidamente em "✓ Starting..." sem nunca chegar a "Ready". Memória livre da máquina caiu pra ~1,2–2,5 GB de 16 GB durante a sessão (muitos processos node acumulados de rodadas anteriores desta sessão + Postgres/Redis via Docker Desktop que eu subi numa rodada anterior) — sintoma consistente com falta de memória pra compilar, não erro de código (`tsc`/`eslint` estão limpos). Um servidor de dev pré-existente do próprio usuário (porta 3000, não iniciado por mim) respondeu, mas com 500 genérico sem stack trace — não investigado a fundo porque não é um processo meu e pode ter causa anterior a esta sessão inteira. Matei os processos que eu mesmo criei (portas 3413/3414) pra não continuar consumindo memória da máquina do usuário.
- **Por isso esta rodada não está fechada** — falta a confirmação visual real que você pediu (print ou `next dev` rodando). Reportando o bloqueio em vez de declarar "tudo ✓" sem essa verificação, como você pediu.

---

# Rodada 6 — densidade, risco e rail universal (PROMPT_REFATORACAO_v6.md, Rodada 6)

> DESIGN.md nesta rodada já incorporava §7.8/§7.9/§4.7.1/§4.7.2 (achados da verificação visual da Rodada 5 — fundo sólido de card em lista e espaço vazio sobrando). Pré-requisito confirmado: nada a refazer das Rodadas 3–5 (cor de marca, topbar, sidebar, hero, vocabulário de estado, tendência+sparkline continuam de pé).

## Item 1 — correção: fundo sólido de card em lista densa

`getContractCardBg`/`getPayerCardBg` removidos de `StatusChip.tsx` (dead code — só existiam pra essas duas listas). `contracts/page.tsx`/`payers/page.tsx`: card volta a `bg-surface-card` neutro, só a pílula (`ContractStatusChip`/`PayerStatusChip`) carrega o estado. `CronogramaCards.tsx` (parcela) **não tocado** — DESIGN.md preserva explicitamente "cartão de parcela vencendo" como o caso de card único em destaque que continua com fundo sólido.

## Item 2 — densidade mínima por linha (§7.8)

Esgotei o schema antes de reportar qualquer coisa como "não existe" (como pedido) — achado real: `contracts.created_at`/`payers.created_at` já existiam na tabela, nunca tinham sido mapeados pro tipo de domínio (`Contract`/`Payer` só usavam parte das colunas do `SELECT *`). Corrigido — campo de graça, zero query nova.

- **Contratos**: 5 campos — avatar/inicial do pagador (`InitialAvatar.tsx`, novo), descrição+parcelas, **próximo vencimento** (`listContractRiskInfo`, nova consulta agregada — `MIN(due_date) FILTER (WHERE status IN ('pending','partial'))` + `BOOL_OR(status='overdue')`, uma query pro tenant inteiro, não uma por contrato), valor, pílula de estado, ação rápida (`RowMenu.tsx`, novo — "Editar", reaproveita a rota que já existe).
- **Pagadores**: avatar, documento+telefone, **"cliente desde"** (`payer.createdAt`), **selo de risco** (item 3 abaixo), pílula, `RowMenu`.
- **Linhas de extrato**: **contraparte** — `getStatementLinesByImport` ganhou `LEFT JOIN payments/payers` (só resolve nome pra linha já casada; sem match, sem contraparte conhecida — é exatamente por isso que está sem match, não é gap de dado). Já tinha data/descrição/valor/chip — completa os 5 campos.
- **Não tocado, com motivo**: lista de imports (`statements/page.tsx`) — "contraparte" não se aplica a um lote de upload, a entidade ali é um arquivo, não uma transação com pagador.

## Item 3 — camada de risco e projeção (§7.9)

- **"Valor em risco"** no Painel — versão SIMPLES construída (permitida explicitamente pelo prompt): soma de `installments.amount_cents - paid_cents` onde `status = 'overdue'`, com composição real ao lado ("X contratos, Y pagadores", `COUNT(DISTINCT ...)` na mesma query). **Versão completa ("pagador historicamente inadimplente") fica de próximo passo** — precisaria pesar o risco por contrato pela taxa de atraso do pagador dele, não só somar vencidas.
- **Selo de risco por pagador** ("atrasou X de Y") — construído de verdade, não só a versão simples-simples: `payer-risk-repository.ts` (novo) agrega `installments` × `contracts` por `payer_id`, contando parcelas já vencidas (`due_date <= hoje`, excluindo cancelada/baixada) vs. quantas estão `overdue` agora. Uma query pro tenant inteiro (`listPayerDelinquencyStats`) reaproveitada em **dois lugares**: selo por linha em Pagadores e ranking na rail (item 4). `computeDelinquencyBadge` (domínio puro, `payers/domain/delinquency.ts`, com teste de propriedade) decide o rótulo/cor.
  - **Limite honesto, documentado no código**: isso conta atraso **atual** (`status = 'overdue'` agora), não "foi pago depois do vencimento" — uma parcela que atrasou e já foi paga não aparece nessa conta, porque `installments.status` vira `paid` sem guardar se foi antes ou depois do vencimento. A versão completa exigiria cruzar `payment_allocations.amount_cents` × `payments.paid_at` contra `installments.due_date` por alocação — reportado como próximo passo, não bloqueia esta rodada (mesma permissão do item de "Valor em risco").
- **Projeção de recebimento 30/60/90 dias**: **bloqueio reportado, não construído** — exigiria "valor esperado histórico" que não é leitura de uma tabela só (a mesma limitação do selo completo, um nível acima). Não é passo obrigatório desta rodada (o próprio prompt já sinalizava isso).

## Item 4 — rail lateral universal (§4.7.2), esgotando fontes antes de desistir

- **Painel** — "Valor em risco" já é o card dominante do bento (item 3); "lista vencendo essa semana" já era a rail "Próximas parcelas" existente desde a Rodada 5 — **não duplicado**, mesmo widget.
- **Contratos** — rail nova: "Vencendo em 7 dias" (reaproveita `listContractRiskInfo`, já buscado pro próprio card) + "Contratos em dia" (% sem nenhuma parcela `overdue`, mesma consulta).
- **Pagadores** — rail nova: ranking dos pagadores com mais parcela vencida (`Medal`/`ranking-icone-1..3` nas 3 primeiras posições, DESIGN.md §2.8/§7.6 — primeira lista real ordenada por valor no produto que qualifica pra medalha) — reaproveita a MESMA query do selo de risco, sem query extra.
- **Extrato** — rail nova: "Últimos imports" (top 3, já vinha ordenado por `createdAt` desc) — só aparece quando há mais de 3 imports (com 3 ou menos seria idêntico à tabela principal, rail decorativa por definição — **não construída** nesse caso, seguindo a própria regra do prompt).
- **Detalhe de contrato/pagador** — selo de risco (item 3) na rail dos dois. "Linha do tempo de pontualidade" (mini sparkline) **não construída** — mesmo motivo do selo simples: exigiria o cruzamento `payment_allocations`/`payments.paid_at` × `due_date`, não é leitura de uma tabela só; reportado como próximo passo.
- **Nenhuma tela ficou sem rail por eu ter desistido cedo** — todas as 5 linhas da tabela do prompt têm widget real; onde faltou algo, foi por limite real de dado (histórico de pontualidade), não por não ter procurado.

## Checklist de recusas — revisado

- Fundo sólido de card em lista com múltiplos itens do mesmo estado: corrigido (item 1). ✓
- Linha de entidade com menos de 4–5 campos quando o dado já existe no schema: corrigido em Contratos/Pagadores/linhas de extrato (item 2). ✓
- Score/selo de risco sem composição explicada: nenhum — "Valor em risco" sempre com "X contratos, Y pagadores"; selo de pagador é o próprio "atrasou X de Y" (autoexplicativo). ✓
- Rail vazia ou decorativa: nenhuma construída sem widget real; Extrato explicitamente fica sem rail quando ≤3 imports. ✓
- Esticar lista/tabela em vez de usar rail: não — tabelas mantiveram largura de conteúdo, rail é coluna própria. ✓
- Grid uniforme, tenant escondido, movimento sem gatilho, raio > 16px, donut de composição, confete, serifa: sem alteração, revisados de novo, nenhuma violação nova. ✓

## Novos arquivos/módulos

`InitialAvatar.tsx`, `RowMenu.tsx` (`src/ui/components`, compartilhados). `payers/infra/payer-risk-repository.ts`, `payers/domain/delinquency.ts` (+ teste). `contracts/infra/contract-repository.ts`: `listContractRiskInfo`. `dashboard`: `AtRiskSummary` + query agregada. `statements/infra/statement-repository.ts`: join de contraparte em `getStatementLinesByImport`.

## Verificação — visual real feita, rodada fecha

- `pnpm exec tsc --noEmit` / `pnpm exec eslint src --ext .ts,.tsx` — limpos.
- `pnpm exec vitest run` — 438/438 (52 arquivos), incluindo os 4 novos de `computeDelinquencyBadge` (exemplo + propriedade).
- **`next dev` confirmado rodando** (porta 3415, depois de matar os processos travados da rodada anterior — o ambiente tinha se recuperado). Login real via `/api/auth/login` com a conta de teste (`teste@parciva.local`, tenant `empresa-teste`).
- **Dado real criado pra verificação** (não vazio) — via funções de aplicação de verdade (`createPayer`/`createContract`, não INSERT cru): 2 pagadores, 2 contratos, com parcelas marcadas `overdue` (só a coluna de status, sem tocar ledger/pagamento) pra exercitar risco/densidade de fato.
- **Verificação por fetch autenticado + grep no HTML renderizado** (sem ferramenta de screenshot disponível nesta sessão — este é o substituto mais próximo de "print" que consegui produzir com as ferramentas que tenho):
  - `/t/empresa-teste/contracts`: `<li>` com `bg-surface-card` (neutro, item 1 confirmado) — `bg-state-contract-active-pastel` só aparece dentro da pílula, nunca no card. Avatar "A"/"C" (`bg-surface-panel`), "vence 2026-07-01"/"2026-06-01" (próximo vencimento real), "Vencendo em 7 dias"/"Contratos em dia" (rail).
  - `/t/empresa-teste/payers`: selo "atrasou 2 de 3", "atrasou 1 de 1", "atrasou 0 de 3", "atrasou 0 de 1" — 4 pagadores reais (2 do seed + "Gustavo", que já existia no tenant), valores diferentes entre si, confirmando que o cálculo reflete dado real de cada pagador, não um valor fixo.
  - `/t/empresa-teste/dashboard`: "Recebido hoje"/"Valor em risco"/"A receber"/"Fila de revisão"/"Taxa de automação" — os 5 cards do bento presentes, "Valor em risco" com composição "N contratos, 2 pagadores".
  - Nenhuma das 3 páginas retornou erro (`grep -i "internal server error\|unhandled runtime error"` — 0 ocorrências nas 3).
- Script de seed (`scripts/qa-seed-temp.ts`) apagado depois de rodar — não fazia parte do produto. Dado de teste criado fica no tenant `empresa-teste` (isolado, não afeta nada real).
