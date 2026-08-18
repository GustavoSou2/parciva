# Style Guide — Baixa Autônoma de Parcelas

> v3 · Cartões, raio maior, tom mais acolhedor sem perder a densidade de ferramenta de trabalho.
> Base herdada da v2 (grotesk + mono, layout de app denso) — o que muda aqui é a forma.

**Status:** vigente · **Última revisão:** ago/2026

---

## 0. O que mudou da v2 para esta

A v2 resolvia hierarquia só com filete de 1px — correto, mas frio para um produto que fala de dívida todo dia com a mesma pessoa. Esta versão mantém a regra de cor e a regra tipográfica, e troca a **unidade estrutural** de tabela-com-filete para **cartão com raio generoso**. O efeito: a interface continua densa e precisa, mas cada bloco de informação agora tem uma borda que acolhe em vez de cortar.

> **A regra não mudou:** a interface é neutra, a cor é reservada ao dinheiro que entrou.
> **A forma mudou:** de filete reto para cartão arredondado — a mesma informação, com mais calor.

---

## 1. Cor

Sem alteração de paleta. Só o fundo dos cartões ganha mais presença, porque agora ele carrega a borda arredondada como elemento visível, não só como fundo passivo.

| Token | Hex | Uso |
|---|---|---|
| `papel` | `#FFFFFF` | Fundo de cartão, campo |
| `fundo` | `#F7F7F5` | Canvas, sidebar, hover |
| `linha` | `#E4E5E1` | Borda de cartão em repouso |
| `linha-forte` | `#D2D4CE` | Borda de cartão em hover/foco |
| `tinta` | `#0E1210` | Texto principal, botão primário |
| `grafite` | `#5C625F` | Texto secundário |
| `névoa` | `#9AA09C` | Rótulo, metadado |
| `liquidado` | `#0F6B45` | Parcela abatida e confirmada |
| `pulso` | `#35D48A` | Só em movimento, nunca em repouso |
| `análise` | `#9A6A18` | Em conferência com o banco |
| `atraso` | `#A0331F` | Vencido, estornado |
| `liquidado-bg` `análise-bg` `atraso-bg` | tons a 6% | Fundo de cartão de estado |

Contraste segue o já validado na v2 (tinta/papel 17,8:1 · grafite/papel 6,4:1 · pares de estado ≥ 6,2:1).

---

## 2. Tipografia — sem alteração de regra

| Papel | Face | Peso / tratamento | Onde |
|---|---|---|---|
| **Dinheiro e métrica** | Inter | 450–500, tabular, −0,03em | Valor, saldo, percentual |
| **Interface e prosa** | Schibsted Grotesk | 400/500/600 | Texto, botão, navegação, título de cartão |
| **Máquina** | Geist Mono | 400/500, +0,04–0,13em | E2E, data, timestamp, rótulo, status |

A diferença nesta versão: o **título do cartão** (o que era `.sg-h3` na v2) agora é Schibsted 600 em 15px, um degrau abaixo do título de seção — porque o cartão é uma unidade menor e mais numerosa que a tabela era.

---

## 3. A unidade estrutural: o cartão

```css
--r-cartao:   16px;   /* era 6px na v2 — este é o eixo que mudou */
--r-campo:    10px;   /* era 6px */
--r-pilula:   999px;  /* inalterado */
--r-mini:     12px;   /* thumbnails, mini-comprovante */

--borda-cartao: 1px solid var(--linha);
--borda-cartao-hover: 1px solid var(--linha-forte);
--sombra-cartao: 0 1px 2px rgba(14,18,16,.04);   /* nova — muito rasa, só separa do fundo */
--sombra-erguida: 0 12px 28px -10px rgba(14,18,16,.14); /* comprovante em arraste, herdada */
```

**Por que 16px e não os 24px "friendly" de template.** Um raio grande demais em uma grade densa de KPIs e linhas de parcela lê como app de consumo, não como ferramenta financeira. 16px é o ponto em que o cartão parece feito à mão para conter números — arredondado o suficiente para acolher, reto o suficiente para inspirar confiança.

**A sombra é nova e deliberadamente quase invisível.** `0 1px 2px rgba(14,18,16,.04)` — ela não empresta profundidade dramática, só descola o cartão do fundo em telas onde `papel` e `fundo` ficam próximos demais para o filete sozinho resolver. A v2 não tinha sombra nenhuma; aqui ela existe, mas seu trabalho é ser notada só na ausência, não na presença.

### Anatomia do cartão padrão

```
┌─────────────────────────────────────┐  ← raio 16px, borda 1px `linha`
│  RÓTULO EM MAIÚSCULA          ●●●   │  ← mono 10px, ações à direita
│                                      │
│  Título do cartão                   │  ← Schibsted 600, 15px
│  Descrição de apoio em uma linha    │  ← Schibsted 400, 13px, grafite
│                                      │
│  ┌────────────┐  ┌────────────┐    │
│  │ R$ 1.060,00│  │ ● liquidado│    │  ← Inter tabular · pílula
│  └────────────┘  └────────────┘    │
└─────────────────────────────────────┘
```

Espaçamento interno: 20px em todos os lados (era 16px na grade de tabela — o cartão precisa de mais ar porque a borda arredondada já "aperta" visualmente os cantos).

---

## 4. Padrões de cartão do sistema

### 4.1 Cartão de KPI (faixa de indicadores)

```css
.kpi{
  background: var(--papel);
  border: var(--borda-cartao);
  border-radius: var(--r-cartao);
  box-shadow: var(--sombra-cartao);
  padding: 18px 20px;
}
```
Substitui a faixa com filete vertical da v2. Os quatro KPIs agora são quatro cartões lado a lado com `gap: 12px`, não mais colados por borda compartilhada — cada um respira, mas a fileira continua com altura fixa e alinhamento rígido de baseline.

### 4.2 Cartão de parcela (substitui a linha de tabela densa)

A tabela de 12 linhas da v2 continua existindo como *visão condensada* (ver 4.4), mas a visão padrão da tela principal passa a ser uma lista de cartões, um por parcela vencendo em breve:

```
┌──────────────────────────────────────────────┐
│ PARCELA 05/12                    VENCE 10 MAI │
│                                                │
│ R$ 1.060,00                      ● provisório │
│                                                │
│ E2E D3F9A1C4… · lido às 09:14                 │
└──────────────────────────────────────────────┘
```

```css
.cartao-parcela{
  background: var(--papel);
  border: var(--borda-cartao);
  border-radius: var(--r-cartao);
  padding: 20px 22px;
  transition: border-color .15s ease, box-shadow .15s ease;
}
.cartao-parcela:hover{
  border-color: var(--linha-forte);
  box-shadow: var(--sombra-cartao);
}
```

Pilha vertical com `gap: 10px` entre cartões — o espaço entre eles substitui o filete horizontal que separava linhas na v2.

### 4.3 Cartão de entrada (zona de comprovante)

```css
.entrada{
  border: 1.5px dashed var(--linha-forte);
  border-radius: var(--r-cartao);
  background: var(--fundo);
  min-height: 120px;
}
.entrada:hover{
  border-style: solid;
  border-color: var(--tinta);
  background: var(--papel);
}
```
Mesmo raio de 16px dos demais cartões — a zona de entrada é, formalmente, o primeiro cartão da tela, só que vazio e com convite.

### 4.4 Tabela condensada (opcional, para quem prefere densidade máxima)

Continua disponível como alternativa de visualização (toggle "lista" / "tabela"), herdando a v2 quase sem alteração — raio de 10px só nos cantos externos do bloco, filete interno entre linhas:

```css
.tabela-condensada{
  border: var(--borda-cartao);
  border-radius: var(--r-campo);
  overflow: hidden; /* corta as linhas internas no raio externo */
}
.tabela-condensada tr{ border-bottom: 1px solid var(--linha); }
```

### 4.5 Cartão de exceção / conciliação (rail)

```css
.cartao-rail{
  background: var(--papel);
  border: var(--borda-cartao);
  border-radius: 14px;   /* um degrau abaixo do cartão principal — é conteúdo secundário */
  padding: 16px 18px;
}
```

### 4.6 Mini-comprovante (thumbnail no fluxo de leitura)

```css
.mini-comprovante{
  border-radius: var(--r-mini);
  border: var(--borda-cartao);
  overflow: hidden;
  width: 56px; height: 70px;
}
```

---

## 5. Pílula de status — sem alteração

Continua pílula (`border-radius: 999px`), mono 9,5–10px, caixa alta. É o único elemento que já era arredondado ao máximo na v2 e continua sendo o contraponto: cartão acolhe, pílula sinaliza — ambos redondos, mas em escalas de raio diferentes para não competirem.

| Estado | Fundo | Texto |
|---|---|---|
| `em aberto` | `fundo` | `grafite` |
| `em análise` | `análise-bg` | `análise` |
| `provisório` / `liquidado` | `liquidado-bg` | `liquidado` |
| `vencido` | `atraso-bg` | `atraso` |

---

## 6. Botões e campos

```css
--r-botao: 10px;   /* era 6px */
--r-campo-input: 10px;
```

Botões e campos sobem para 10px — um degrau abaixo do cartão (16px), coerente com a lógica de "quanto maior o container, maior o raio proporcional, mas nunca igual". Botão primário continua `tinta`; nunca verde.

```
┌──────────────────┐   ┌──────────────────┐   ┌──────────────────┐
│  Registrar        │   │  Exportar          │   │  Estornar baixa │
└──────────────────┘   └──────────────────┘   └──────────────────┘
     r 10px, tinta            r 10px, borda         r 10px, borda
                                                       texto atraso
```

---

## 7. Layout — estrutura herdada, preenchimento em cartões

```
┌────────────┬───────────────────────────────────┬──────────────┐
│  SIDEBAR   │  CONTEÚDO                         │  RAIL         │
│  228px     │                                    │  296px        │
│            │  ┌────┐┌────┐┌────┐┌────┐          │  ┌──────────┐ │
│  fundo     │  │KPI ││KPI ││KPI ││KPI │          │  │ cartão   │ │
│  sólido    │  └────┘└────┘└────┘└────┘          │  │ raio 14  │ │
│            │                                    │  └──────────┘ │
│            │  ┌──────────────────────────────┐  │  ┌──────────┐ │
│            │  │  Solte o comprovante          │  │  │ cartão   │ │
│            │  └──────────────────────────────┘  │  └──────────┘ │
│            │                                    │               │
│            │  ┌──────────────────────────────┐  │               │
│            │  │  Cartão de parcela 05         │  │               │
│            │  └──────────────────────────────┘  │               │
│            │  ┌──────────────────────────────┐  │               │
│            │  │  Cartão de parcela 06         │  │               │
│            │  └──────────────────────────────┘  │               │
└────────────┴───────────────────────────────────┴──────────────┘
```

A sidebar continua sólida e sem cartão — é estrutura fixa, não conteúdo. O rail passa a usar cartões de raio 14px (um degrau abaixo do conteúdo principal) para os blocos de auditoria, exceção e conciliação.

---

## 8. Régua de baixa — inalterada

O elemento assinatura não é um cartão e não ganha raio maior: continua traço fino, reto, sem arredondamento nas pontas. É o contraste proposital do sistema — tudo que guarda informação é cartão acolhedor; a régua que resume o cronograma inteiro continua rígida, quase técnica, porque ali a precisão importa mais que o acolhimento.

```
▮ ▮ ▮ ▮ ▮ │ │ │ │ │ │ │
```

---

## 9. Movimento — ajuste pontual

A coreografia da baixa (filete que varre, campos que entram, saldo que desce, pílula que respira) é a mesma da v2. Duas adições por causa do cartão:

- **Assentamento do cartão de parcela:** quando uma parcela nova entra na lista (ex.: próxima parcela some da régua "em aberto" e aparece como cartão em destaque), ela nasce com `scale: 0.97 → 1` e `opacity: 0 → 1` em 220ms, `ease: back.out(1.2)` — o leve overshoot do raio grande pede um pouco mais de elasticidade do que a tabela reta pedia.
- **Hover do cartão de parcela:** borda `linha` → `linha-forte` e sombra `0 → sombra-cartao` em 150ms — sutil, só confirma que o cartão é clicável.

```js
gsap.from(".cartao-parcela.novo", {
  scale: 0.97, opacity: 0, duration: 0.22, ease: "back.out(1.2)"
});
```

---

## 10. O que isso resolve e o que isso custa

**Resolve:** a sensação de "planilha fria" que a v2 podia transmitir em telas com poucas linhas — o cartão dá contorno próprio a cada parcela, o que ajuda quem olha o produto uma vez por mês (não um operador full-time) a se orientar sem aprender uma grade.

**Custa:** menos densidade por centímetro quadrado que a tabela pura. Por isso a tabela condensada (4.4) continua disponível como alternativa — quem opera o dia inteiro pode preferir voltar a ela.

---

## 11. Recusas — mantidas e uma nova

- Serifa em qualquer lugar do sistema.
- Verde em botão primário.
- Gráfico de pizza ou donut para composição de dívida.
- Confete e gamificação de pagamento.
- Dark mode nesta fase.
- **Nova:** raio acima de 16px em qualquer cartão de conteúdo financeiro — testado internamente em 20–24px e o resultado lia como app de carteira de consumo, não como ferramenta de gestão. 16px é o teto.