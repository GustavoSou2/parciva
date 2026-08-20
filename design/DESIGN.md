# DESIGN.md — v6 "Confiança Viva" (rodada 6 — contraste mínimo, correção de monotonia)

> Rodada 1: reescrita completa. Rodada 2: navegação, filtros, gráfico ampliado. Rodada 3: arquitetura de grid (§4.7). Rodada 4: densidade de linha + inteligência de negócio (§7.8/§7.9). Rodada 5: rail lateral universal (§4.7.2). Rodada 6 (esta): a correção do fundo sólido de card (Rodada 6 de execução) resolveu a monotonia verde, mas foi longe demais — pílula quase invisível, métrica única (67%) virou texto solto em vez do gauge já especificado, avatar de contraparte sem variação de cor. Três correções: contraste mínimo obrigatório na pílula (§2.5), gauge obrigatório pra métrica única (§7.1), avatar com cor por identidade (§7.8).
> Não é mais uma pilha de emendas — as decisões de v4/v5 que sobreviveram foram incorporadas direto no corpo do texto; as que não sobreviveram estão listadas em §0.2 com o motivo.
> Referências: Finixra (dashboard sidebar + KPI + gráfico empilhado), Bankio (hero pessoal + card spotlight + atividade recente), Ombrelone (tooltip interativo, indicador ao vivo, ranking, gauge).

---

## 0. Por que reescrever em vez de emendar

### 0.1 O que as três referências têm em comum, além de cor

Antes de qualquer paleta: as três referências resolvem a mesma coisa de formas diferentes — **densidade de informação sem parecer planilha**. Isso vem de quatro decisões repetidas nas três, independente da cor escolhida:

1. Todo número importante tem contexto imediato ao lado (variação, comparação, timestamp) — nunca um número solto.
2. Toda ação (botão, link, item ativo) usa **a mesma cor de marca**, sem exceção — é isso que faz a interface parecer "de um produto só", não uma colagem de componentes.
3. Gráfico e lista sempre têm um ponto de interação (hover, tooltip, live update) — é o que diferencia "dashboard" de "print de dashboard".
4. Hierarquia vem de tamanho e peso tipográfico, não de mais cor — a cor sinaliza categoria/estado, o tamanho sinaliza importância.

### 0.2 O que estava errado no v4/v5 — revogado explicitamente aqui

| Regra antiga | Onde estava | Por que caiu |
|---|---|---|
| "Botão primário é sempre `tinta` (preto/neutro), nunca cor de marca" | `style-guide.md` §6 (arquivo removido do projeto — histórico apenas), DESIGN.md §8 | Nenhuma das três referências faz isso — as três usam a cor de marca no botão/CTA principal. Era a regra que mais contradizia o pedido de "vida" desde a primeira conversa. |
| "Ícone colorido por categoria quebra a regra, banido em card de KPI" | Anexo A | Bania exatamente o elemento (ícone com fundo tintado no card) que mais contribui pra escaneabilidade nas três referências. |
| "Não existe verde-positivo/vermelho-negativo arbitrário" tratada como regra única | §2.2 | Correta pra *estado de entidade* (vencido não é culpa do cliente), errada quando aplicada também a *variação percentual de métrica* — são conceitos diferentes que a v6 separa em tokens diferentes (§2.4). |
| Ausência de qualquer especificação de sparkline, tooltip, indicador "ao vivo" ou ranking | em nenhum lugar | Não eram recusa — eram lacuna. Uma IA aplicando o documento à risca nunca teria material pra construir isso, mesmo quando pedido. |
| Nenhum componente de hero/saudação ou CTA de upsell formalizado | §1.5.5 só mencionava "voz de saudação" em texto corrido | Falta o componente em si — como estrutura, dimensão, comportamento responsivo. |

O que **não** mudou, porque já estava certo: base neutra como estrutura, tipografia (Inter/Schibsted/Geist Mono), raio 16px como teto, régua de cronograma reta como contraponto, `prefers-reduced-motion` em tudo, e a separação entre GSAP (coreografia de domínio) e Framer Motion (interação local).

---

## 1. Princípios

1. **Neutro é estrutura, cor é vocabulário — e o vocabulário agora tem mais palavras.** Canvas, sidebar, header continuam neutros (isso não mudou). O que mudou é quantos papéis a cor pode cumprir dentro do conteúdo: marca/ação, dado, estado, tendência, categoria, urgência ao vivo. Cada papel tem um token próprio — nenhum é "decoração", cada um responde a uma pergunta específica que o usuário faz olhando a tela.
2. **Toda ação do usuário é a mesma cor.** Botão primário, link, item de navegação ativo, foco de campo, checkbox marcado — um único acento de marca, sem variação. É essa repetição, não a intensidade da cor, que dá sensação de produto maduro (vs. protótipo com paleta improvisada por tela).
3. **Todo número relevante vem com contexto, nunca solto.** Variação percentual, comparação com período anterior, ou um tooltip sob hover — se o número decide algo, ele explica de onde veio.
4. **Todo elemento arredondado tem um contraponto reto.** Herdado sem alteração: a régua de cronograma continua reta.
5. **Movimento é frequente, mas nunca gratuito — "vida contínua" não é "decoração contínua".** A diferença entre um app vivo e um app ansiogênico não é *quantidade* de movimento, é se cada movimento está ancorado em algo real: dado chegando, valor mudando, usuário tocando. Nesta versão, movimento aparece com muito mais frequência que antes (gráfico desenha ao carregar, número conta ao atualizar, ponto "ao vivo" pulsa, tooltip segue o cursor, item de menu expande) — mas a régua permanece a mesma: **se o dado por trás não mudou, a tela não deveria estar se movendo.**
6. **Respiro generoso entre elementos ≠ tela vazia por falta de conteúdo.** Padding e gap continuam generosos (isso não muda) — mas espaço de tela sobrando porque a tela só tem 2–3 elementos é lacuna de conteúdo, não "composição madura". As referências têm respiro **e** aproveitam a área com widget de contexto real ao mesmo tempo; uma tela vazia com muito espaço em branco não é "clean", é rala. Isso vale pra toda tela com dado, não só o Painel (§4.7.2).

---

## 2. Cor

### 2.1 Base neutra (estrutura — inalterada)

| Token | Hex | Uso |
|---|---|---|
| `papel` | `#FFFFFF` | Fundo de cartão, campo, tooltip claro |
| `fundo` | `#F6F6FA` | Canvas, sidebar, hover — leve viés frio (era `#F7F6F3`, ajustado pra conversar com o acento indigo sem competir) |
| `linha` | `#E6E7F0` | Borda em repouso |
| `linha-forte` | `#D3D5E3` | Borda em hover/foco |
| `tinta` | `#12131A` | Texto principal |
| `grafite` | `#5C5F6E` | Texto secundário |
| `névoa` | `#9A9DAE` | Rótulo, metadado |

Contraste mínimo mantido: tinta/papel ≥ 17:1 · grafite/papel ≥ 6,4:1.

### 2.2 Acento de marca — agora com papel amplo (a mudança central da v6)

```css
--acento:       #4F46E5;  /* indigo — único acento de AÇÃO do sistema */
--acento-hover: #4338CA;
--acento-soft:  #EEF0FD;  /* fundo de estado ativo/hover em nav, badge suave */
```

**Onde entra, sem exceção — é a mesma cor em todo lugar:**
botão primário, link, item de navegação ativo (texto + ícone preenchido), anel de foco, checkbox/radio marcado, barra de progresso, CTA de upsell (§7.3).

**Onde não entra:** fundo de canvas/sidebar/header (estrutura fica neutra), texto de estado de entidade (isso é §2.5), cor de dado em gráfico com mais de uma série (isso é §2.3 — evita o acento de ação virar "mais uma cor de gráfico" e perder força de sinalização de "isso é clicável").

Isso **revoga** a regra antiga de "botão primário sempre `tinta`". Não é suavização — é reversão completa, com justificativa registrada em §0.2.

**Clarificação (achado da varredura da rodada de expansão total): "link" aqui significa link de prosa** — texto de ação embutido num bloco (ex.: "esqueci minha senha", "cadastrar pagador"), nunca dentro de um card. **Cartão clicável é categoria diferente**: quando a linha/card inteiro é a área de clique, o título continua `content-primary` — a affordance de "isso é clicável" vem do hover do próprio card (borda `linha`→`linha-forte`, sombra aparecendo), não da cor do texto. Pintar título de card de `acento` espalharia cor demais e contradiria "cor é sinal reservado" em vez de reforçar.

### 2.3 Cor de dado — exclusiva de gráfico/gauge (mantida da v5, papel inalterado)

```css
--dado-1: #2EC6E0;   /* teal — série primária, gauge padrão */
--dado-2: #7C6FF0;   /* violeta — série secundária, cartão spotlight */
--dado-1-soft: #E4F6FA;
--dado-2-soft: #ECEAFB;
```
Nunca em botão, nav, borda — só em: linha/barra de gráfico, arco de gauge/donut de métrica única, fundo do cartão spotlight (§7.2).

### 2.4 Tendência de métrica — nova categoria, separada de estado de entidade

```css
--tendencia-alta: #16A34A;   /* variação positiva vs. período anterior */
--tendencia-baixa: #DC2626;  /* variação negativa vs. período anterior */
```
**Uso único:** selo pequeno ao lado de uma métrica (`↑ 7% este mês`), nunca no corpo do card, nunca reclassificando a entidade. Semanticamente diferente do §2.5 — "esse contrato está vencido" é estado; "essa métrica caiu 5%" é tendência. Nunca usar a mesma cor pra dizer as duas coisas na mesma tela sem essa distinção clara (ex.: se `atraso` e `tendencia-baixa` forem visualmente parecidos, adicionar o ícone de seta pra desambiguar).

### 2.5 Pastel de estado de entidade — mantido, com vocabulário estendido

Tabela original (estado de **parcela**):

| Estado | Texto/ícone | Pastel de fundo |
|---|---|---|
| Em aberto | `grafite` | `fundo` |
| Em análise | `#9A6A18` | `#FBF0D9` |
| Liquidado/confirmado | `#0F6B45` | `#E1F3E8` |
| Vencido | `#A0331F` | `#FBE6E1` |

**Nova — estado de contrato** (lacuna identificada; vocabulário próprio, não reaproveita o de parcela porque são perguntas diferentes: parcela pergunta "essa cobrança específica está em que fase", contrato pergunta "esse relacionamento inteiro está ativo"):

| Estado | Texto/ícone | Pastel de fundo |
|---|---|---|
| Ativo | `#0F6B45` | `#E1F3E8` |
| Encerrado | `grafite` | `fundo` |
| Suspenso | `#9A6A18` | `#FBF0D9` |
| Inadimplente | `#A0331F` | `#FBE6E1` |

**Nova — estado de pagador**, mesma lógica, mesmo conjunto de tokens de cor reaproveitado (ativo/inativo/inadimplente) — não inventar hex novo por entidade, o vocabulário de cor é fixo, só o rótulo textual muda por contexto.

**Contraste mínimo obrigatório na pílula (achado real da Rodada 6):** a correção do fundo sólido de card revelou um problema novo — pílula com pastel de fundo pode ficar sutil demais e virar quase invisível sobre `papel` branco, perdendo o propósito original do token (reconhecimento de estado à distância, §2.2 original). **Regra: a pílula sempre leva fundo pastel + texto na cor saturada correspondente (nunca só o texto colorido sobre fundo transparente), com contraste mínimo de 3:1 entre o pastel de fundo e o `papel` ao redor** — se o pastel escolhido não atingir isso, escurecer o pastel (não a decisão de usar pastel). Testar visualmente, não só confiar no hex definido na tabela — cor "correta no token" que não se distingue na tela é o mesmo problema de não ter cor nenhuma.

### 2.6 Categoria em linha de lista densa — mantido da v5

```css
--chip-1: #E4F6FA;
--chip-2: #ECEAFB;
--chip-3: #FBF0D9;
--chip-4: #EEF0FD;  /* nova — reaproveita acento-soft pra categoria "ação/sistema" */
```
Fundo de ícone (28–32px) em linha de extrato/transação, categoria fechada e conhecida, máximo 4 tons reciclados.

### 2.7 Indicador "ao vivo" — novo, papel único

```css
--live-dot: #16A34A;  /* mesma cor de tendencia-alta — "algo está acontecendo agora" é semanticamente positivo/ativo por natureza */
```
Ponto pequeno (6–8px) com pulso de opacidade (0.4↔1, 1.6s loop) ao lado de um rótulo tipo "ao vivo" ou "atualizando" — só quando o dado por trás realmente atualiza em tempo real. Nunca decorativo; se a tela não tem polling/websocket real, não usar o indicador.

### 2.8 Ranking — novo, papel único, três tons fixos

```css
--ranking-1: #D4A017;  /* ouro */
--ranking-2: #9CA3AF;  /* prata */
--ranking-3: #B45309;  /* bronze */
```
Só em posições 1–3 de uma lista ordenada por valor (ex.: top produtos, top pagadores). Posição 4+ usa numeral simples em `grafite`, sem cor. Nunca usar esses três tons em outro contexto — são reservados à leitura imediata de "isso é um pódio".

---

## 3. Tipografia — mantida sem alteração

| Papel | Face | Peso/tratamento | Onde |
|---|---|---|---|
| Dinheiro e métrica | Inter | 450–500, tabular, −0,03em | Valor, saldo, percentual |
| Interface e prosa | Schibsted Grotesk | 400/500/600 | Texto, botão, navegação, título |
| Máquina | Geist Mono | 400/500, +0,04–0,13em | E2E, data, timestamp, rótulo, status |

Escala: `display-xl` 4rem, `display` 2.5rem, `title` 1.75rem, `metric` 1.375rem, `body` 0.875rem, `aux` 0.75rem, `micro` 0.6875rem (caps, tracking 0.09em). Salto binário mantido — evita tamanho "morno" em título.

---

## 4. Forma — mantida, com dois componentes novos

```css
--r-cartao: 16px;   /* teto do sistema */
--r-campo:  10px;
--r-botao:  10px;
--r-pilula: 999px;
--r-rail:   14px;
--r-mini:   12px;
--sombra-cartao: 0 1px 2px rgba(18,20,15,.04);
```

Regra de proporção mantida: quanto maior o container, maior o raio, nunca dois containers do mesmo raio em escalas diferentes.

### 4.1 Hero de abertura — novo

Faixa no topo da tela principal (dashboard/painel), antes de qualquer card de dado:

```
Bom dia, [Nome]
Acompanhe seus contratos e receba mais rápido.
```
- Saudação em `--text-title`, Schibsted 600; subtítulo em `--text-body`, `grafite`.
- Sem fundo próprio (transparente sobre `fundo`) — não é um card, é cabeçalho de página.
- Saudação varia por horário (bom dia/boa tarde/boa noite) — texto, não decoração; se não houver nome de usuário disponível, cai para "Olá" sem quebrar o padrão.
- Aparece **só** na tela que é ponto de entrada do fluxo (painel principal), não em toda tela — evita repetir saudação em tela secundária, que ficaria estranho.

### 4.2 Cartão CTA/upsell — novo

```css
.cartao-cta {
  background: linear-gradient(135deg, var(--acento) 0%, var(--acento-hover) 130%);
  color: #FFFFFF;
  border-radius: var(--r-cartao);
  padding: 20px;
}
```
Usado pra convite de ação de negócio (upgrade de plano, ativar automação, completar cadastro) — nunca pra exibir dado (saldo, métrica). Sempre com um único botão de ação dentro, texto curto (uma frase de benefício + verbo). No máximo um por tela, mesma regra do cartão spotlight (§7.2) — competem pelo mesmo "slot" de destaque, então nunca os dois juntos na mesma tela.

### 4.3 Topbar — busca e seletor de tenant

Faixa fixa no topo da coluna de conteúdo (não da sidebar), altura `--spacing-nav` (52px):

```
[ 🔍 Buscar contratos, pagadores...        ]   [ 🏢 Empresa Alfa ▾ ]   [ 🔔 ]  [ ⚙ ]  [ 👤 Nome ▾ ]
```

- **Busca**: campo com ícone outline à esquerda, `--r-campo`, fundo `fundo`, borda só aparece no foco (`acento`). Preenchido, expande a lista de resultado como um dropdown leve — reaproveita entrada/saída de Framer Motion já usada em modal.
- **Seletor de tenant (crítico em produto multitenant — nunca opcional/escondido):** chip clicável com avatar/inicial da empresa + nome + chevron, sempre visível na topbar, nunca dentro de um menu de configuração secundário. Ao clicar, abre lista das empresas que o usuário tem acesso, com a atual marcada (check em `acento`). Trocar de tenant é a ação mais consequente da topbar — merece o mesmo peso visual que o nome/avatar do usuário, não menos.
- Notificação (sino) recebe badge de contagem (§4.5) quando há item não lido.

### 4.4 Barra de filtros

Fileira abaixo do header da página, acima do conteúdo de dado:

```
[ 📅 Este mês ▾ ]   [ 📦 Todos os produtos ▾ ]   [ x Contratos ativos ]   [ x Pagador: Gustavo ]
```

- Cada filtro ativo vira um **chip removível** (ícone `X`, fundo `acento-soft`, texto `acento`) — remove ao clicar, nunca precisa reabrir o dropdown só pra tirar um filtro.
- Seletor de período é sempre o primeiro da fileira; abre popover com atalhos (Hoje, 7 dias, Este mês, Personalizado) — nunca só um calendário vazio.
- Mudança de filtro dispara o mesmo padrão de "atualização ao vivo" do §6 nos números afetados (contador cinético curto), não um reload abrupto da tela.

### 4.5 Sidebar robusta — grupos, ícones e contagem

Estrutura em grupos com rótulo `label-micro`, não lista plana:

```
MAIN
  ⊞ Painel
  📄 Contratos
  👥 Pagadores
APPS
  💬 Chat            (3)
  📧 Email           novo
```

- Item ativo: fundo `acento-soft`, texto e ícone em `acento`, ícone preenchido — regra herdada do v4.1, mantida.
- **Badge de contagem**: círculo 18–20px, fundo `acento` (ou `trend-down` se for algo que exige atenção urgente, ex.: "Fila de revisão"), número em `content-on-inverse`, `--text-micro`. Acima de 99, mostrar "99+".
- **Badge de novidade**: pílula pequena "novo", fundo `acento-soft`, texto `acento`.
- Entrada em stagger ao montar (GSAP, ~45ms entre itens) — herdado sem alteração.

### 4.6 Composição de fundo sutil

Formas orgânicas desfocadas (`blur` 60–90px), opacidade 8–15%, usando `dado-2-soft`/`acento-soft` — nunca cor saturada. Uso restrito a: fundo de tela de autenticação, fundo do hero (atrás do texto, nunca atrás de card com dado), empty state. **Nunca** atrás de card com número/tabela — contraste de leitura vem primeiro.

### 4.7 Arquitetura de grid — a peça que faltava

Até esta rodada, toda mudança da v6 foi cor/componente **em cima do mesmo esqueleto herdado** (sidebar fixa + coluna + rail, cards empilhados em pilha vertical uniforme). Nenhuma rodada anterior questionou esse grid. As três referências, olhadas de novo agora com esse filtro, compartilham uma estrutura que nunca foi extraída como regra — e é isso que dá a elas a sensação de "composição", não só de "lista de cards":

**Toda tela de dado real tem duas camadas, nunca uma pilha só:**

1. **Camada de resumo** — bento assimétrico no topo. Não é grid uniforme (todos os cards do mesmo tamanho): um elemento domina (o card de saldo/hero mais largo ou mais alto que os outros), os elementos de apoio são menores e ficam ao redor. Finixra faz isso com o card "Total Balance" mais largo à esquerda + 4 KPIs menores em 2×2; Bankio com o "Total Balance" alto à esquerda + gauge alto à direita + 4 KPIs menores no meio; Ombrelone com o gráfico de receita largo à esquerda + o painel "Checkout ao vivo" à direita, mesma altura.
2. **Camada de detalhe** — tabela ou lista, sempre largura total, sempre abaixo da camada de resumo. Nunca ao lado, nunca antes. É onde o dado denso vive depois que o resumo já orientou o olhar.

```css
--grid-cols: 12;
--grid-gutter: 16px;
```

Cards recebem `span` de coluna (ex.: hero `col-span-4 row-span-2`, KPI `col-span-2`, gráfico principal `col-span-8`) — nunca todos os cards da mesma linha com a mesma largura por padrão. Cards da mesma linha compartilham altura mesmo com largura diferente (é o que faz o bento parecer desenhado, não empilhado por acidente).

**Isso se aplica como contexto pra toda tela com dado agregável, não só o Painel.** Uma lista hoje "morta" — como a tela de Contratos que motivou esta reescrita — deixa de ser só uma pilha de cards idênticos e ganha:
- Uma camada de resumo mínima no topo (ex.: 3 números pequenos — total de contratos, valor total ativo, quantos vencidos — numa fileira, não um dashboard completo, só o suficiente pra a tela parar de ser plana).
- A lista de contratos em si vira a camada de detalhe, largura total, abaixo.

**Onde essa arquitetura não se aplica, de propósito:** telas de formulário, configuração, autenticação — não têm dado agregável pra resumir, forçar uma "camada de resumo" ali seria decoração vazia (contradiria §1, princípio 1). Camada única continua certa nesses casos.

### 4.7.2 Rail lateral universal — a peça que fecha o espaço vazio em toda tela

**Achado real (o usuário apontou espaço em branco sobrando em praticamente toda tela, não só no Painel):** duas camadas (resumo + detalhe) resolvem a estrutura vertical, mas em telas largas ainda sobra espaço horizontal — e a tendência errada é só alargar a lista/tabela pra ocupar, o que deixa a informação "esticada" sem ganhar densidade. A correção certa é uma **terceira região: rail lateral (296px, já definida em `--spacing-rail`), presente em toda tela com dado real — não exclusiva do Painel.**

O rail não é decoração — é onde vive o **widget de contexto relacionado que não cabe na lista principal, mas é informação real que a empresa precisa**:

| Tela | Widget candidato ao rail |
|---|---|
| Painel | Card de risco (§7.9), lista "vencendo essa semana" |
| Contratos | "Vencendo nos próximos 7 dias" (mini-lista), taxa de contratos em dia vs. atraso |
| Pagadores | Ranking de pagadores com mais atraso histórico (§2.8/§7.6) |
| Extrato | Resumo de conciliação do período (casadas vs. pendentes) |
| Detalhe de contrato/pagador (§4.7.1) | Linha do tempo de pagamento (mini sparkline de pontualidade), selo de risco (§7.9) |

**Regra: rail só entra se houver widget de contexto real pra colocar — nunca um card vazio ou decorativo só pra preencher.** Se não houver dado real pra nenhum widget da tabela acima, a tela fica de duas colunas mesmo (conteúdo + nada), e isso é uma resposta válida — mas deve ser checada tela por tela, não assumida de antemão. É exatamente o oposto do erro anterior (deixar a tela vazia por omissão): aqui a regra é "procure o widget real antes de desistir do rail", não "preencha com qualquer coisa pra não ficar vazio".

### 4.7.1 Tela de detalhe de entidade única — versão leve, não o grid completo

Contrato individual, pagador individual — 1–2 números centrais (saldo, parcelas pagas), não uma fileira de KPIs. Aplicar o grid de 12 colunas aqui seria over-engineering pra pouco conteúdo. Em vez disso: número principal em `--text-display`/`--text-metric` dominando (§1.5.1, já existia, sem mudança), um segundo número secundário ao lado numa fileira simples de 2 blocos (não 12 colunas), lista relacionada (ex.: parcelas do contrato) abaixo — mesma lógica de duas camadas do §4.7, executada mais leve por não ter volume de KPI suficiente pra justificar o bento completo.

---

## 5. Ícones — mantido, com adição de medalha

Outline puro, `stroke-width: 1.75`, `lucide-react`. Cor herda do texto ao redor ou da cor saturada de estado/tendência — nunca cor própria fora dessa lista. Preenchido (`fill: currentColor`) reservado a item ativo de navegação.

**Novo:** ícone de medalha/pódio (`Award`/`Medal` do lucide) colorido nos três tons de `--ranking-1/2/3` (§2.8) — única excepcionalidade de ícone com cor própria fixa, porque a cor *é* a informação (posição no ranking), não uma categoria arbitrária.

---

## 6. Motion — mantido, com tooltip e live update

| Motor | Papel | Onde |
|---|---|---|
| GSAP | Coreografia de domínio | Entrada de cartão na lista, check de confirmação, stagger de sidebar/menu |
| Framer Motion | Interação local | Hover/tap de card e botão, entrada/saída de modal e **tooltip de gráfico** |

**Tooltip de dado (novo):** aparece no hover/tap sobre um ponto de gráfico ou barra, fundo `tinta` com texto `papel`, `--r-campo`, contém sempre rótulo temporal + valor (nunca só o valor solto). Entra/sai com Framer Motion, ~120ms, sem overshoot (é leitura de dado, não celebração).

**Atualização "ao vivo" (novo):** quando um valor conectado a polling/websocket muda, o número faz um contador cinético curto (GSAP, ~400ms) pro valor novo — mesmo padrão já usado em outros contadores do sistema. O ponto de `--live-dot` (§2.7) pulsa continuamente enquanto a conexão estiver ativa.

`prefers-reduced-motion` sempre respeitado — tooltip e contador caem para aparecer/atualizar instantâneo, sem transição.

---

## 7. Componentes de dado

### 7.1 Gauge radial de métrica única

Arco em `dado-1`/`dado-2` sobre trilho `linha`, espessura 10px, número central em `--text-display`. Distinto de donut de composição (múltiplas categorias somando 100%, que seria substituído por waffle chart — ver §9). Anima uma vez, na entrada do dado real.

**Obrigatório, não opcional, quando o widget é uma métrica única em %.** Achado real da Rodada 6: "Contratos em dia 67%" foi implementado como texto solto (rótulo + número), sem o gauge — exatamente o caso que este componente existe pra cobrir. **Regra: toda vez que um widget de rail/KPI mostrar uma porcentagem única (não composição), o gauge é o padrão default — número solto só é aceitável se o espaço físico do widget for pequeno demais pro anel (ex.: célula muito estreita em mobile), e mesmo assim o número deve levar cor (`dado-1`/`dado-2`), nunca ficar em `content-primary` neutro.**

### 7.2 Cartão spotlight

```css
.cartao-spotlight {
  background: linear-gradient(135deg, var(--dado-2) 0%, var(--acento-hover) 130%);
  color: #FFFFFF;
  border-radius: var(--r-cartao);
}
```
No máximo um por tela, nunca em cartão de saldo/dívida — reservado a métrica de atividade/engajamento. Se a tela já tem um `.cartao-cta` (§4.2), não usar os dois juntos.

### 7.3 Sparkline

Mini-gráfico de área com gradiente (`dado-1`/`dado-2`, opacidade decrescente de baixo pra cima), altura fixa 32–40px, sem eixo nem rótulo visível — é textura de tendência histórica, não leitura precisa. Vive dentro do card de KPI, ao lado do selo de tendência (§2.4).

### 7.4 Chip de categoria em lista densa

Círculo 28–32px com fundo `chip-1..4`, ícone outline dentro. Só em linha de lista (extrato, transações), nunca em card de KPI (ali o padrão é sparkline + selo de tendência, não chip).

### 7.5 Selo de tendência

Pequena pílula ou texto com seta (`↑`/`↓`) + percentual, cor `tendencia-alta`/`tendencia-baixa`, ao lado do valor principal do card de KPI. Sempre relativo a um período nomeado ("este mês", "vs. ontem") — nunca um percentual sem contexto temporal.

### 7.6 Linha de ranking

`número ou medalha` + nome/categoria + valor + contagem, em linha de lista (não card). Posições 1–3 recebem ícone de medalha (§5) na cor correspondente; 4+ recebem numeral em `grafite`.

### 7.7 Gráfico de comparação, projeção e histórico

Três necessidades diferentes, três tratamentos — nunca resolver as três com a mesma linha/cor:

**Comparação (período atual vs. anterior, na mesma barra/grupo):**
```css
--dado-3: #F5A623;  /* terceira cor de dado — só para o 3º segmento de funil/comparação, nunca 4ª+ */
```
Preferência: **um tom saturado (`dado-1`) + o mesmo tom com padrão hachurado** (`opacity: var(--opacity-hatch)`, 0.35, herdado) para o período anterior — evita "dois tons saturados competindo" (regra antiga do Anexo B, ainda válida). `dado-3` só entra quando a comparação tem 3 categorias reais simultâneas (ex.: funil "iniciado / processando / concluído") — não é uma 4ª opção de paleta livre, é especificamente pra esse caso de funil de 3 estágios.

**Projeção/forecast (linha pontilhada no futuro):**
```css
--dado-forecast-dasharray: 4 4;
```
Mesma cor do dado real (`dado-1`/`dado-2`), traço tracejado em vez de sólido — nunca uma cor separada só pra "isso é previsão". O tooltip (§6) deixa explícito "projetado" no rótulo quando o ponto é forecast.

**Histórico (seletor de intervalo):**
Controle segmentado (`7d | 30d | 90d | 12m`), pílula com item ativo em `acento-soft`/`acento` — mesmo padrão do filtro de período (§4.4), não um componente novo. Trocar o intervalo redesenha a linha com a animação de entrada já definida (GSAP, uma vez por troca — trocar de intervalo é gatilho real, não decoração).

### 7.8 Densidade informacional mínima por linha de entidade

**Achado real da rodada de verificação visual:** uma tela com camada de resumo (§4.7.1) mas linha de entidade rala (nome + valor + status, só 3 campos) continua lendo como "pobre de informação" mesmo depois de toda a arquitetura de duas camadas estar correta — porque densidade real vem de quantos pontos de dado cabem por linha, não de quantas camadas a tela tem.

**Regra: toda linha/card de entidade de negócio real (contrato, pagador, transação — não item de configuração) mostra no mínimo 4–5 campos de contexto**, não só identificador + valor + status:

- Identificador (nome/título) + contraparte (avatar/inicial em chip, §2.6/§7.4 — **cor do avatar varia por identidade, não fica todo no mesmo tom neutro**: hash do nome/id mapeado pra um dos tons de `chip-1..4` em rotação, mesmo conjunto de 4 cores já definido, nunca uma 5ª cor livre. É a diferença entre "Carlos", "Ana" e "Gustavo" serem visualmente distinguíveis à primeira olhada ou todos lerem como o mesmo elemento cinza repetido).
- Valor monetário (hierarquia already estabelecida).
- Estado (pastel, §2.5) — pílula, não fundo de card inteiro em lista densa (ver revisão de §2.5 abaixo).
- **Dado temporal de próxima ação** (próximo vencimento, criado em, última atividade) — sempre presente, é o que transforma "lista estática" em "lista operável".
- Ação rápida (`•••`/menu contextual) visível na linha, não só ao clicar no card inteiro.

**Revisão de §2.5 (fundo sólido de card):** reservado a contexto de **card único em destaque** (ex.: cartão de parcela vencendo, no estilo já herdado do v3) — em **lista densa de múltiplas entidades**, o estado usa pílula pequena, não fundo de linha inteira. Motivo registrado na verificação visual: fundo sólido em toda linha de uma lista onde todos os itens compartilham o mesmo estado (ex.: todos os contratos `ativo`) produz um bloco de cor uniforme que não sinaliza nada — o oposto do propósito do pastel de estado.

### 7.9 Camada de risco e projeção — inteligência de negócio, não só estética

**O motivo de existir:** este produto existe pra uma empresa cobrar. A pergunta real de quem abre o painel não é só "quanto eu tenho", é **"onde estou perdendo dinheiro, e onde vou perder se não agir"**. Isso é dado que já existe (histórico de pagamento, atraso, parcela vencida) — só nunca foi composto como informação de risco, só como registro passado.

**Componentes novos:**

- **Card "Valor em risco"**: soma de parcelas vencidas + parcelas de contratos com pagador historicamente inadimplente, em destaque (`--text-metric`, cor `tendencia-baixa` no número, nunca cor de estado — é uma projeção agregada, não o estado de uma entidade). Sempre com o texto de composição ao lado ("X contratos, Y pagadores"), nunca um número solto.
- **Selo de risco por pagador/contrato**: pequeno indicador (não pílula de estado — é *previsão*, categoria diferente) ao lado do nome, baseado em taxa histórica de atraso daquele pagador especificamente (ex.: "atrasou 3 de 8 parcelas"). Usa a mesma paleta de `tendencia-baixa`/`tendencia-alta` (§2.4) — é tendência de comportamento, não estado de uma parcela específica.
- **Projeção de recebimento** (30/60/90 dias): reaproveita o padrão de linha tracejada do §7.7 — valor esperado (linha sólida, histórico) vs. valor projetado (linha tracejada, mesma cor), com o "valor em risco" subtraído visualmente da projeção (área hachurada, `--opacity-hatch`) pra mostrar "isso é o que eu realmente devo esperar receber, descontando quem provavelmente não vai pagar".
- **Onde constrói:** Painel (camada de resumo, ao lado dos KPIs existentes) e, na versão leve (§4.7.1), no detalhe de pagador individual — é exatamente o lugar onde "esse pagador específico é confiável?" precisa de resposta rápida.

**Onde não constrói:** não inventar modelo de previsão de crédito sofisticado — a base é sempre estatística simples e visível (taxa de atraso histórico do próprio pagador/contrato), nunca uma caixa-preta de score sem explicação ao lado.

---

## 8. Recusas — revisadas para v6

- Serifa em qualquer lugar do sistema.
- Donut/pizza de **composição** (múltiplas categorias somando 100%) — waffle chart é o substituto.
- Confete e gamificação de pagamento.
- Animação de entrada sem gatilho de mudança de estado real, ou tooltip/live-dot sem dado real por trás.
- Raio acima de 16px em cartão de conteúdo financeiro.
- Dark mode nesta fase.
- Mais de um cartão de destaque (`spotlight` **ou** `cta`) por tela.
- Cor de dado (`dado-1`/`dado-2`) fora de gráfico/gauge/spotlight.
- Mais de 4 tons no chip de categoria, ou tons de ranking usados fora de posição 1–3.
- Selo de tendência sem período nomeado ao lado.
- Composição de fundo sutil (§4.6) atrás de card com número/tabela — só em espaço vazio (auth, hero, empty state).
- `dado-3` usado fora do caso de comparação/funil de 3 estágios (§7.7) — não é uma 4ª cor de paleta livre.
- Cor separada para linha de projeção/forecast — é sempre a mesma cor do dado real, só tracejada (§7.7).
- Seletor de tenant escondido dentro de menu secundário — tem que estar sempre visível na topbar (§4.3), é a ação mais consequente ali.
- Movimento contínuo sem dado real por trás mudando — "vida" é frequência de gatilho real, não loop decorativo (§1, princípio 5 recalibrado).
- Camada de resumo (§4.7) forçada em tela sem dado agregável (formulário, configuração) — isso é decoração vazia, viola §1 princípio 1.
- Grid de cards todos do mesmo tamanho na camada de resumo — bento é assimétrico de propósito; largura uniforme volta a parecer "planilha em cards", o problema original desta conversa inteira.
- Linha de entidade de negócio real com menos de 4–5 campos de contexto quando o schema já tem esse dado disponível (§7.8) — "resumo mínimo" acima da lista não substitui densidade na própria linha.
- Fundo sólido de card em lista densa de múltiplas entidades quando todas compartilham o mesmo estado (§7.8/revisão de §2.5) — pastel de estado é pra distinguir, não pra pintar a tela inteira de uma cor só.
- "Score de risco" apresentado sem a composição/motivo ao lado (§7.9) — número de risco sem explicação é caixa-preta, não inteligência de negócio.
- Rail lateral vazio ou decorativo só pra preencher espaço (§4.7.2) — só entra com widget de contexto real; se não houver, a tela fica sem rail, não com um card sem função.
- Esticar lista/tabela pra ocupar espaço horizontal sobrando em vez de usar o rail — informação esticada não é informação mais densa.
- Pílula de estado sem contraste mínimo visível (§2.5) — cor "correta no token" que não se distingue na tela é o mesmo problema de não ter cor nenhuma.
- Métrica única em % renderizada como texto solto quando o gauge (§7.1) é o padrão default pra esse caso.
- Avatar de contraparte todo no mesmo tom neutro (§7.8) — cor varia por identidade dentro do set de 4 tons já definido, nunca uma cor nova por pessoa.
- **Removida nesta versão** (ver §0.2 para o motivo): botão primário obrigatoriamente neutro; ícone colorido banido em card de KPI; regra única de cor bom/ruim cobrindo tendência e estado ao mesmo tempo.

---

## 9. Responsividade — mantida da v5, com hero/CTA adicionados

```css
--bp-sm: 640px; --bp-md: 768px; --bp-lg: 1024px; --bp-xl: 1280px;
```

| Elemento | Desktop | Tablet | Mobile |
|---|---|---|---|
| Sidebar | Fixa expandida | Rail de ícones | Drawer |
| Rail direita | Coluna própria | Move abaixo do conteúdo | Idem, largura 100% |
| **Grid bento (§4.7)** | Spans assimétricos (12 col) | Reduz pra 6–8 col, hero mantém destaque proporcional | Colapsa pra 1 coluna — hero sempre primeiro, ordem segue importância, nunca ordem do DOM original por acaso |
| Grid de KPI | 4 colunas | 2 colunas | 1 coluna, padding 20→16px |
| Hero (§4.1) | Título `title`, subtítulo visível | Idem | Subtítulo pode ocultar se a tela ficar muito apertada verticalmente — título nunca oculta |
| Cartão CTA/spotlight | Ocupa 1 célula da fileira | Idem | Vira a primeira célula da coluna única |
| Gauge | 200–240px | 180px | 140–160px |
| Sparkline | Largura do card | Idem | Idem — nunca corta, encolhe proporcionalmente |
| Tooltip de gráfico | Segue o cursor | Segue o toque | Fixo acima do ponto tocado (evita cobrir o dedo) |
| Modal | Largura fixa centrado | Idem | Tela cheia |

Regra geral mantida: reempilhar e rolar, nunca omitir dado.

---

## 10. Anexo — o que cada referência contribuiu

| Referência | Adotado | Adaptado | Rejeitado |
|---|---|---|---|
| **Finixra** | Grid de 4 KPI, ícone colorido no card, gráfico de duas séries | Paleta recolorida pra `dado-1`/`dado-2` | Nav superior com abas (mantemos sidebar) |
| **Bankio** | Hero de saudação, card spotlight sólido, lista de atividade com ícone por categoria, selo de tendência ao lado do valor | Cor do spotlight migrada pra `dado-2`→`acento-hover` | Paleta de wallet/bandeira de país (fora do domínio) |
| **Ombrelone** | Tooltip com timestamp+valor, indicador "ao vivo" pulsante, gauge radial, ranking com medalha, sparkline sob o valor principal | Paleta recolorida pro indigo (`acento`) em vez do azul original | Fundo escuro de moldura em volta do card (é frame de mockup de marketing, não parte do produto) |

---

## 11. Próximos passos

1. ~~Migrar `SidebarNav`, `Button` e qualquer link/foco pra `acento` (indigo)~~ — feito (Rodadas 3–5).
2. ~~Construir hero de saudação no Painel~~ — feito (Rodada 5).
3. ~~Vocabulário de estado de contrato/pagador (§2.5)~~ — feito (Rodada 5), mas revisar aplicação: confirmar que virou pílula, não fundo de card inteiro (§7.8).
4. **Novo — enriquecer linha de entidade (§7.8)**: adicionar contraparte/avatar, data de próxima ação, ação rápida (`•••`) em Contratos/Pagadores/Extrato — resolve o "pobre de informação" que sobrou mesmo depois da camada de resumo.
5. **Novo — card "Valor em risco" + selo de risco por pagador (§7.9)** no Painel — primeira peça real de inteligência de negócio, não só estética.
6. **Novo — projeção de recebimento 30/60/90 dias (§7.9)** no Painel, condicionada a dado histórico já existir sem precisar de agregação nova cara — se faltar, reportar como bloqueio, não inventar.
7. Se houver tela de upsell/plano, usar `.cartao-cta` — senão, registrar como "sem tela real pra aplicar".