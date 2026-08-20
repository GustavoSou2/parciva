# DESIGN.md — Refatoração de UI · v4 "Acolhedor com Peso"

> Base: síntese de `quitou.theme.css` / `quitou.tokens.json` (Parciva, dashboard monocromático + acento menta) e `style-guide.md` v3 (Baixa Autônoma de Parcelas, cartões arredondados).
> **Status:** proposta para revisão · **Substitui:** paleta dupla / regra de forma divergente entre os dois sistemas herdados.

---

## 0. Diagnóstico: o que a refatoração está resolvendo

Hoje existem dois sistemas de tokens vivendo lado a lado sem se falar:

| | Parciva (theme.css/tokens.json) | v3 (style-guide.md) |
|---|---|---|
| Paleta | `ink` (escala neutra) + `mint` como único acento | `papel/fundo/tinta/grafite` + 4 cores de estado (liquidado, análise, atraso, pulso) |
| Forma | Sem raio explícito de cartão, sombra `none` | Cartão 16px, sombra quase invisível |
| Regra de cor | "Cor só no que é dinheiro/IA" | "Cor só no estado da parcela" |

Os dois concordam no princípio (base neutra, cor é sinal — não decoração) e divergem na execução. Esta versão unifica os dois em um único sistema, e resolve o pedido novo: **mais pastel + acentos marcantes, cantos arredondados, mas com peso de ferramenta financeira** — não de app de carteira de consumo. Isso não é uma contradição a resolver com força bruta; é uma extensão natural da regra que já existia: em vez de "cor só em 3 papéis pontuais", agora **estados inteiros ganham fundo pastel**, e o acento marcante fica reservado a **um único gesto** (CTA e confirmação de ação concluída). Restrição vira permissão, não abandono da regra.

---

## 1. Princípios (em ordem de prioridade)

1. **Neutro é a regra, cor é a exceção com propósito.** Nunca uma tela inteira em cor. Pastel entra como *fundo de estado* (contexto), o acento vivo entra como *sinal de ação* (algo que você pode fazer ou algo que acabou de acontecer).
2. **Acolhedor não é o mesmo que informal.** Raio, pastel e ícone animado comunicam "isso não vai te assustar". Contraste tipográfico, alinhamento rígido e números tabulares comunicam "isso é levado a sério". As duas coisas coexistem na mesma tela.
3. **Todo elemento arredondado tem um contraponto reto.** Herdado do v3 (§8): a régua de cronograma continua reta. É o que evita a interface inteira "derreter" em fofura.
4. **Movimento explica, não decora.** Um ícone anima quando o estado dele muda de verdade (pendente → confirmado), não porque "fica bonito no load".

---

## 1.5 Personalidade e presença — aplicado a toda a superfície do produto

As duas referências trazidas (Anexos A e B) foram lidas como telas de dashboard, mas o que você está pedindo agora é maior: pegar o que faz esses layouts parecerem **maduros, com presença, delicados mas não infantis** — e tratar isso como regra do produto inteiro, não só da tela inicial. Nenhum item abaixo depende de paleta (a paleta continua fechada em §2); são decisões de **hierarquia, espaço e voz** que qualquer tela — formulário, configuração, tela vazia, erro, confirmação — deve seguir.

1. **Número grande é hierarquia, não decoração de dashboard.** Onde houver um valor central pra decisão do usuário (saldo, valor da parcela, total negociado, taxa de conciliação), ele domina visualmente sobre o rótulo — não só na tela inicial. Uma tela de confirmação de pagamento, por exemplo, trata o valor com o mesmo peso tipográfico que o "Total Balance" das referências, mesmo sendo uma tela de formulário.
2. **Anotação contextual no lugar de legenda solta.** Em vez de uma legenda genérica embaixo de um gráfico, a informação de apoio (variação, marco, comparação) aparece como uma pílula ancorada exatamente no ponto que ela explica — como o marcador "antes/depois" do Anexo B. Esse vocabulário se repete em qualquer lugar do produto que precise contextualizar um número: extrato, histórico de negociação, relatório mensal — não é exclusivo de gráfico de dashboard.
3. **Espaço negativo generoso é regra de composição, não luxo da tela inicial.** Formulário de cadastro, tela de configuração e tela de erro seguem o mesmo respiro (padding, gap entre blocos) dos cartões principais — nada nessas telas fica mais "apertado" só por ser considerado secundário. Presença vem de a interface não ter medo de espaço vazio.
4. **Presença humana onde há mais de uma pessoa envolvida.** Pilha de avatares (Anexo A) não é elemento decorativo de dashboard — é o vocabulário do produto pra "alguém real está do outro lado" (negociação assistida, conciliação com o banco, atendimento). Aparece em qualquer tela onde isso for verdade.
5. **Voz de saudação e copy pessoal no topo de fluxo, não só na tela inicial.** O tom de "Bom dia, [nome]" das referências não é exclusivo do dashboard — qualquer tela que seja o início de uma tarefa (iniciar negociação, revisar cronograma, confirmar baixa) pode abrir com uma linha de voz direta e pessoal antes de qualquer dado, seguindo o registro de copy definido no skill de frontend design: verbos ativos, nomeando o que a pessoa controla, sem vender.
6. **A escala de elevação e raio (§4) é do produto, não da tela inicial.** Modal, empty state e tela de erro seguem exatamente `--r-cartao`/`--sombra-cartao` — não existe uma versão "mais simples" dessas telas com raio zero ou sombra ausente. É essa consistência, mais do que qualquer elemento isolado, que dá a sensação de "maduro" em vez de "protótipo com uma tela bonita e o resto improvisado".

**Como isso muda o handoff pro Claude Code:** o `PROMPT_REFATORACAO.md` original foi escrito pensando em componentes de cartão/pílula/campo, que já cobrem a maior parte disso. O ajuste é de **escopo**: ao aplicar os passos do prompt, ele deve varrer todas as telas do produto (não só a tela com cartões de parcela) e aplicar os itens 1–6 acima como checklist adicional, mesmo em telas que hoje não têm cartão nenhum.

---

## 2. Cor

### 2.1 Base neutra (herdada, unificada)

| Token | Hex | Uso |
|---|---|---|
| `papel` | `#FFFFFF` | Fundo de cartão, campo |
| `fundo` | `#F7F6F3` | Canvas, sidebar, hover |
| `linha` | `#E4E5E1` | Borda em repouso |
| `linha-forte` | `#D2D4CE` | Borda em hover/foco |
| `tinta` | `#12140F` | Texto principal, botão primário |
| `grafite` | `#5C625F` | Texto secundário |
| `névoa` | `#9AA09C` | Rótulo, metadado |

Contraste mínimo mantido: tinta/papel ≥ 17:1 · grafite/papel ≥ 6,4:1.

### 2.2 Pastel de estado — a mudança principal

Antes, o fundo de estado era um "tom a 6%" quase subliminar. Agora ele sobe de intensidade o suficiente para ser reconhecido por cor à distância (varredura visual rápida), mantendo o texto do estado na versão saturada só no rótulo/ícone — nunca no corpo do cartão inteiro.

| Estado | Acento saturado (texto/ícone) | Pastel (fundo do cartão/pílula) |
|---|---|---|
| Em aberto | `grafite` `#5C625F` | `fundo` `#F7F6F3` |
| Em análise | `análise` `#9A6A18` | `análise-pastel` `#FBF0D9` |
| Liquidado / confirmado | `liquidado` `#0F6B45` | `liquidado-pastel` `#E1F3E8` |
| Vencido | `atraso` `#A0331F` | `atraso-pastel` `#FBE6E1` |

Regra herdada e mantida: **não existe verde-positivo/vermelho-negativo genérico.** Essas quatro cores são nomeadas por *estado do processo*, não por "bom/ruim" — o vencido é urgência de ação, não culpa do cliente. Isso é o que já discutimos: vermelho/laranja saturado de alerta fica reservado só para isso, nunca para ênfase decorativa.

### 2.3 O acento marcante — um só, usado em dois lugares

```
--acento: #35D48A;   /* "pulso", herdado do v3 — nunca em repouso */
--acento-hover: #1F9C4F;
```

Único papel do acento vivo:
- **Confirmação em movimento** — o pulso que já existia em v3 (parcela sendo liquidada agora, comprovante sendo lido).
- **Botão de ação com IA/automação** — herdado do papel do `mint` em Parciva.

Continua **proibido** como cor de botão primário (isso é `tinta`) e como fundo de área grande. É a cláusula que evita a paleta pastel escorregar para "app de carteira consumer" — o brilho é raro por design, não por limitação técnica.

### 2.4 Onde entra o pastel "gostoso" que você pediu

Pastel de estado (2.2) já cobre boa parte do pedido. Para dar mais personalidade sem abrir uma paleta nova, dois usos adicionais, sempre em áreas pequenas e não-informacionais:
- **Ilustração vazia/onboarding**: pode usar 2–3 pasteis (análise-pastel, liquidado-pastel, um terceiro `--lavanda-pastel: #ECEAFB` só para isso) em composições ilustrativas — nunca em UI funcional.
- **Avatar/badge de "quem enviou"**: fundo pastel rotativo por identidade (não por estado), só em contexto social/timeline, nunca em valores monetários.

---

## 3. Tipografia — regra herdada, sem alteração

| Papel | Face | Peso/tratamento | Onde |
|---|---|---|---|
| Dinheiro e métrica | Inter | 450–500, tabular, −0,03em | Valor, saldo, percentual |
| Interface e prosa | Schibsted Grotesk | 400/500/600 | Texto, botão, navegação, título de cartão |
| Máquina | Geist Mono | 400/500, +0,04–0,13em | E2E, data, timestamp, rótulo, status |

Manter o salto binário de escala (micro caps vs. display) do sistema Parciva para títulos — evita tamanhos intermediários "mornos" que não decidem se são rótulo ou destaque.

---

## 4. Forma

```css
--r-cartao:   16px;  /* teto do sistema — testado até 24px e leu como app consumer */
--r-campo:    10px;
--r-botao:    10px;
--r-pilula:   999px;
--r-rail:     14px;  /* um degrau abaixo do cartão principal */
--r-mini:     12px;

--borda: 1px solid var(--linha);
--borda-hover: 1px solid var(--linha-forte);
--sombra-cartao: 0 1px 2px rgba(18,20,15,.04);
```

Regra de proporção mantida: **quanto maior o container, maior o raio — nunca dois containers com o mesmo raio em escalas diferentes.** É essa hierarquia, mais do que o valor absoluto de cada raio, que faz o sistema parecer "levado a sério" mesmo sendo redondo.

O contraponto reto (régua de cronograma, §8 do v3) é mantido sem alteração — é o elemento que assina "isso é uma ferramenta financeira, não um passatempo".

---

## 5. Ícones — outline, animados, um único peso de traço

- **Estilo**: outline puro (sem preenchimento), `stroke-width: 1.75`, cantos levemente arredondados no próprio traço do ícone — ecoa o raio dos cartões sem copiar o valor.
- **Biblioteca recomendada**: `lucide-react` — outline consistente, tree-shakeable, cobre o vocabulário do domínio (relógio, cadeado, check, alerta, upload de comprovante).
- **Cor**: ícone herda a cor do texto ao redor (`tinta`, `grafite`, ou a cor saturada de estado da tabela 2.2) — nunca uma cor própria fora dessa lista.
- **Animação = mudança de estado, não decoração de entrada:**
  - Check de confirmação: `stroke-dashoffset` anima de traço vazio para completo (~280ms, ease-out) no momento exato em que o backend confirma — não ao montar o componente.
  - Ícone de alerta (vencido): pulso de opacidade sutil (0.7↔1, 1.6s, loop) só enquanto o item está na aba ativa/visível — para quando o usuário sai do contexto, para não virar ruído ansiogênico.
  - Ícone de upload/comprovante: pequeno bounce vertical (2–3px) só no hover, confirma "isso é clicável" sem exigir leitura.
- **Recusa explícita**: ícone preenchido (solid) fica reservado só para o estado ativo de navegação (sidebar), nunca em conteúdo — mantém o outline como "vocabulário neutro" e o solid como "você está aqui".

---

## 6. Motion — dois motores, papéis diferentes

| Motor | Papel | Onde |
|---|---|---|
| **GSAP** | Coreografia orquestrada, multi-elemento, na timeline do domínio | Varredura da régua de baixa, entrada de cartão de parcela na lista (`scale 0.97→1`, `back.out(1.2)`, 220ms), sequência de confirmação de pagamento |
| **Framer Motion (pacote `motion`)** | Interação local, por componente, idiomática em React | Hover/tap de cartão e botão, `layout` automático quando um cartão muda de estado (aberto→liquidado) e precisa se realocar na lista, entrada/saída de modais e toasts |

Regra prática: se a animação **entende o domínio** (uma parcela virando outra coisa, uma régua varrendo o tempo), é GSAP. Se a animação **só responde ao dedo/mouse do usuário no componente**, é Framer Motion — evita reimplementar spring physics à mão em cada botão.

Sempre respeitar `prefers-reduced-motion`: pulso, bounce e dashoffset caem para transição instantânea de opacidade/estado, sem exceção.

---

## 7. Pílula de status — sem alteração de forma, paleta atualizada

| Estado | Fundo | Texto |
|---|---|---|
| Em aberto | `fundo` | `grafite` |
| Em análise | `análise-pastel` | `análise` |
| Liquidado | `liquidado-pastel` | `liquidado` |
| Vencido | `atraso-pastel` | `atraso` |

Mono 9,5–10px, caixa alta, `border-radius: 999px` — segue sendo o único elemento no raio máximo do sistema, contraponto redondo ao cartão redondo, mas em escala diferente para não competir visualmente.

---

## 8. Recusas — mantidas do v3, revistas à luz do novo pedido

- Serifa em qualquer lugar do sistema.
- Verde saturado (`acento` ou `liquidado`) em botão primário — botão primário é sempre `tinta`.
- Pastel de estado usado como fundo de área grande (hero, sidebar inteira) — pastel é sempre *contido* em cartão/pílula.
- Ícone com preenchimento sólido fora da navegação ativa.
- Gráfico de pizza/donut para composição de dívida.
- Confete e gamificação de pagamento.
- Animação de entrada (mount) sem gatilho de mudança de estado real — se anima, é porque algo mudou.
- Raio acima de 16px em cartão de conteúdo financeiro.
- Dark mode nesta fase (sem alteração).

---

## 9. Stack técnico recomendado

```bash
npm install gsap motion lucide-react
```

- `gsap` — versão atual estável na íntegra (timeline, ScrollTrigger se necessário para reveals).
- `motion` — é o pacote atual da biblioteca que era publicada como `framer-motion`; o nome antigo ainda existe no npm como alias, mas `motion` é o ponto de instalação recomendado hoje.
- `lucide-react` — ícones outline.

**Nota honesta:** não encontrei nenhuma skill chamada "impeccable" no catálogo disponível aqui (nem em `/mnt/skills`, nem na busca de plugins/skills da sua organização) — se você tem um nome ligeiramente diferente ou é algo específico de outro ambiente, me diga que eu procuro de novo. Também não há um projeto Node real neste ambiente (sem `package.json`/`node_modules`) — este documento e o comando acima ficam prontos para quando você rodar isso no seu repo local ou me pedir para gerar um scaffold aqui mesmo.

---

## 10. Anexo A — Estrutura de layout de referência (grid de dashboard)

Referência estrutural adotada de um padrão comum de dashboard financeiro (sidebar + coluna central + rail direita), **traduzida para o sistema de tokens deste documento** — nenhum elemento que já está na lista de recusas (§8) entra aqui, mesmo que existisse na referência original.

```
┌────────┬──────────────────────────────────────┬──────────────┐
│ SIDEBAR│  HEADER: saudação + campo de filtro   │  RAIL        │
│ fixa   ├──────────────────────────────────────┤  296px       │
│ ícones │  ┌────┐┌────┐┌────┐┌────┐             │ ┌──────────┐ │
│ outline│  │ KPI││ KPI││ KPI││ KPI│  (§4.1 .kpi)│ │ resumo/   │ │
│        │  └────┘└────┘└────┘└────┘             │ │ saldo     │ │
│        │                                       │ └──────────┘ │
│        │  ┌──────────────────────────────────┐ │ ┌──────────┐ │
│        │  │ gráfico de fluxo (linha/área)     │ │ │ próximas │ │
│        │  │ rótulo inline no fim de cada série│ │ │ parcelas │ │
│        │  └──────────────────────────────────┘ │ │(cartao-  │ │
│        │                                       │ │ rail 14px│ │
│        │                                       │ └──────────┘ │
└────────┴──────────────────────────────────────┴──────────────┘
```

**Elementos que a referência tinha e que ficam de fora**, com o motivo e a substituição:

| Elemento da referência | Por que fica de fora | Substituto no nosso sistema |
|---|---|---|
| Gráfico donut de composição de despesas | Recusa explícita §8 | Lista horizontal com barra de proporção preenchida em `névoa`/`tinta` — mesma informação, sem o formato recusado |
| Ícone colorido por categoria (azul/laranja/vermelho/roxo) nos cards de KPI | Quebra a regra "cor é sinal reservado" §2 | Ícone outline neutro (`grafite`) + variação expressa só em texto (seta + %), cor saturada de estado só entra se o KPI representar um estado real (ex: "vencido") |
| Botões "Receive/Send" no card de resumo | Fora do domínio (não é carteira P2P) | Botões `Registrar` / `Exportar` já definidos em §6 do style-guide herdado |
| Fundo colorido em card de saldo destacado | Cartão de resumo usa `papel`/`tinta`, sem fundo saturado | — |

**O que aproveitamos de fato, sem ressalva:**
- Grid de 4 cards de KPI no topo da coluna central.
- Rail direita fixa com um "card de resumo" no topo e uma lista de itens abaixo (mapeia direto para `.cartao-rail`, §4.5).
- Pilha de avatares sobrepostos (`-8px` de overlap, borda `papel` de 2px) para indicar múltiplas pessoas envolvidas numa cobrança/negociação, se o produto tiver esse caso de uso.
- Rótulo inline no fim da série do gráfico (em vez de legenda flutuante separada) — mais direto de ler, e já é compatível com `data-actual`/`data-forecast` (§2 do sistema herdado).

---

## 11. Anexo B — Padrões de visualização de dados (segundo grid de referência)

Segunda referência trazida foi outro template de dashboard financeiro (nav superior, paleta terracota/pêssego quente). A paleta dele **não entra** — é justamente um dos três clichês de design gerado por IA que evitamos por padrão (fundo creme + acento terracota), então o que aproveitamos aqui é só a **estrutura dos widgets de dado**, recolorida 100% dentro do sistema neutro + acento único já definido.

| Padrão da referência | O que ele resolve bem | Adaptação ao nosso sistema |
|---|---|---|
| Barra empilhada por período (saldo mês a mês, dois tons empilhados) | Mostra composição + total no mesmo elemento, sem donut | Empilhar em tons da escala `ink`/neutra (`linha-forte` para a base, `tinta` para o segmento mais recente/confirmado) — nunca dois tons saturados diferentes na mesma barra |
| Número grande + badge de variação ao lado (ex: métrica + "+15%") | Já é o padrão do nosso `.kpi`, §4.1 — sem mudança |
| Linha anotada com marcador "antes/depois" e ponto de referência vertical | Ótimo para mostrar o efeito de uma renegociação/baixa: saldo antes vs. depois da conciliação | Recriar com `data-actual` (linha `tinta` sólida) vs. `data-forecast` (linha `linha-forte` tracejada), marcador de ponto só em `tinta`, sem duotone laranja/preto |
| **Grid de pontos (waffle chart)** representando percentual | Alternativa de proporção sem ser pizza/donut — informação equivalente, textura diferente | **Adotado como substituto oficial de donut** nas telas que precisam mostrar percentual de composição: pontos preenchidos em `tinta`/`acento` (só quando o percentual é o de "confirmado"), pontos vazios em `linha` |
| Três cards pequenos lado a lado, cada um com número + mini-gráfico de tendência + badge de % | Bom para comparar métricas relacionadas (ex: taxa de resposta a cobrança, taxa de conciliação automática) | Recolorir com a paleta de pastel de estado (§2.2) no lugar do laranja/preto — cada card usa a cor do estado que representa, não uma cor decorativa fixa |
| Navegação superior com abas (Dashboard/Analytics/Invoice/...) | — | **Não adotado por padrão** — o Anexo A já fixou sidebar lateral fixa para este produto. Só troque para nav superior se você decidir isso conscientemente; não é uma mudança que eu faria só por causa da referência. Assumindo que mantém a sidebar, a menos que você me diga o contrário. |

**Resumo da regra ao misturar referências:** cada nova referência visual entra como *fonte de padrões estruturais de composição* (como organizar dado, que tipo de gráfico usar para que tipo de informação), nunca como fonte de paleta. A paleta é uma decisão já fechada em §2 e não muda por causa de template de referência.

---

## 12. Emenda v4.1 — mais cor, navegação em sidebar

> **Status:** vigente, já implementado no código · **Motivo:** pedido explícito do usuário (a versão anterior deste documento estava lida como "cinza e branco demais" na prática — a regra "cor é exceção" estava correta na intenção mas conservadora demais na execução). Esta seção existia numa revisão anterior deste arquivo e foi restaurada aqui após o documento ter sido reescrito do zero — mantida por rastreabilidade da decisão, já que o comportamento abaixo está rodando em produção de dev desde então.

O que muda:

1. **Pastel de estado (§2.2) agora pode ser o fundo do cartão inteiro**, não só da pílula, em qualquer cartão cujo conteúdo principal seja uma entidade com estado (cartão de parcela, de proposta de revisão, etc.). Isso **revoga** o trecho de §8 "Pastel de estado usado como fundo de área grande... pastel é sempre contido em cartão/pílula" nesse ponto específico — continua proibido em canvas/sidebar/header (estrutura, não conteúdo).
2. **Navegação em sidebar** (228px, como o layout do style-guide.md §7 / Anexo A já previa) substitui o header horizontal. Ícone outline por item; item ativo vira **preenchido** (`fill: currentColor`) — já era a regra de §5 ("preenchido reservado ao estado ativo de navegação"), só não existia sidebar pra aplicá-la.
3. **Entrada animada dos itens do menu**: stagger (GSAP, ~45ms entre itens, `power2.out`) quando a sidebar monta — mesmo padrão já usado em `CronogramaCards`/`ActivateMfaSection`, mesmo respeito a `prefers-reduced-motion`.

O que **não** muda: acento vivo (`#35D48A`) continua com os mesmos dois papéis só (§2.3) — "mais cor" aqui significa pastel mais presente, não o acento saturado extrapolando pro resto da interface. Botão primário continua `tinta`. Canvas/sidebar continuam neutros (estrutura fixa, style-guide.md §7 / Anexo A).

---

## 13. Próximos passos sugeridos

1. Validar a tabela de contraste dos pasteis novos (2.2) com o texto de estado sobreposto — o salto de 6% para uma faixa mais visível pode exigir reajuste fino do tom do texto saturado.
2. Prototipar o cartão de parcela com o ícone de check animado (GSAP dashoffset) para calibrar timing contra o pulso existente do v3, evitando dois movimentos competindo no mesmo cartão.
3. Migrar os tokens de `quitou.tokens.json` (nomenclatura `ink`/`mint`) para a nomenclatura `papel`/`tinta`/`grafite` deste documento, para eliminar a duplicidade de sistemas.