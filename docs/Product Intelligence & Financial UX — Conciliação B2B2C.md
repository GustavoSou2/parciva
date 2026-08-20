# Product Intelligence & Financial UX

## 1. Contexto do produto

Esta aplicação é um SaaS B2B2C de gestão e conciliação financeira.

A empresa utiliza a plataforma para:

- gerenciar contratos;
- gerenciar clientes vinculados aos contratos;
- controlar parcelas;
- acompanhar valores previstos;
- acompanhar valores recebidos;
- receber comprovantes de pagamento;
- validar informações dos comprovantes;
- conciliar pagamentos com parcelas;
- identificar pagamentos pendentes;
- identificar atrasos;
- acompanhar a saúde financeira dos contratos;
- acompanhar a evolução dos recebimentos.

O sistema não deve ser tratado como um simples CRUD de contratos e parcelas.

Ele é uma **plataforma de inteligência operacional e financeira para contas a receber**.

---

# 2. PRINCÍPIO FUNDAMENTAL

A aplicação deve responder não apenas:

> "O que existe no banco de dados?"

Mas principalmente:

> "O que está acontecendo?"

> "Por que está acontecendo?"

> "O que provavelmente vai acontecer?"

> "O que precisa da minha atenção?"

> "Onde existe risco ou perda?"

A UI deve transformar os dados operacionais existentes em **informação útil para tomada de decisão**.

---

# 3. NÃO CONSTRUA APENAS CRUD

Evite uma aplicação composta principalmente por:

- tabelas;
- filtros;
- formulários;
- páginas de detalhes;
- CRUD de contratos;
- CRUD de clientes;
- CRUD de parcelas.

Esses elementos são necessários, mas não devem ser a experiência inteira.

O usuário deve conseguir enxergar tendências, comparações, projeções e anomalias.

---

# 4. CAMADA OPERACIONAL + CAMADA ANALÍTICA

A aplicação deve possuir duas camadas.

## Operational Layer

Responsável por executar o trabalho:

- contratos;
- clientes;
- parcelas;
- pagamentos;
- comprovantes;
- conciliação;
- validações;
- ações.

## Intelligence Layer

Responsável por explicar o negócio:

- métricas;
- tendências;
- projeções;
- comparativos;
- variações;
- riscos;
- perdas;
- atrasos;
- concentração;
- eficiência da conciliação;
- saúde dos recebíveis.

As duas camadas devem coexistir.

---

# 5. MÉTRICAS

Identifique métricas relevantes para o negócio e utilize-as onde fizer sentido.

Não coloque métricas apenas para preencher espaço.

Possíveis métricas:

### Recebimento

- valor previsto;
- valor recebido;
- valor pendente;
- valor atrasado;
- percentual recebido;
- percentual em atraso;
- taxa de recebimento;
- variação contra período anterior.

### Conciliação

- parcelas conciliadas;
- parcelas aguardando conciliação;
- comprovantes processados;
- comprovantes pendentes;
- taxa de conciliação automática;
- taxa de conciliação manual;
- tempo médio de conciliação;
- divergências encontradas.

### Risco

- valor em atraso;
- valor potencialmente perdido;
- contratos com atraso recorrente;
- clientes com comportamento de atraso;
- parcelas próximas do vencimento;
- concentração de recebíveis;
- contratos com maior exposição financeira.

### Performance

- recebimento mensal;
- crescimento;
- evolução da inadimplência;
- evolução da taxa de conciliação;
- evolução do volume processado.

Somente exiba métricas que possam ser calculadas de forma confiável a partir dos dados existentes.

Não invente métricas sem significado.

---

# 6. PROJEÇÕES

Sempre que os dados disponíveis permitirem, utilize projeções.

Exemplos:

### Próximos recebimentos

Mostrar:

> R$ 184.500 previstos para os próximos 30 dias

com uma visualização temporal.

### Fluxo esperado

Mostrar:

```text
Ago    R$ 120k
Set    R$ 145k
Out    R$ 167k
Nov    R$ 181k
Dez    R$ 193k
```

com comparação entre:

- previsto;
- recebido;
- atrasado.

### Forecast

Quando houver dados históricos suficientes, apresentar:

> Expected receivables

e não apenas uma lista de parcelas futuras.

Importante:

Se não houver dados suficientes para uma projeção confiável, não inventar previsão.

Nesse caso, mostrar apenas o valor contratado/previsto.

---

# 7. COMPARAÇÕES

Informações isoladas são menos úteis do que comparações.

Sempre que apropriado, comparar:

- este mês vs mês anterior;
- este mês vs mesmo período anterior;
- recebido vs previsto;
- atrasado vs recebido;
- conciliado vs não conciliado;
- contratos ativos vs encerrados;
- clientes novos vs recorrentes;
- taxa atual vs média histórica.

Exemplo:

```text
Recebido

R$ 428.500
↑ 12,4%

vs. mês anterior
```

O número sozinho não explica nada.

A variação fornece contexto.

---

# 8. VARIAÇÕES

Sempre que uma métrica importante for apresentada, considere mostrar:

- valor atual;
- variação;
- período de comparação.

Exemplo:

```text
Recebimentos
R$ 428.500
↑ 12,4% vs. mês anterior
```

ou:

```text
Em atraso
R$ 38.200
↓ 8,7% vs. mês anterior
```

Use cores semanticamente:

- verde → melhora;
- vermelho → piora;
- neutro → pouca alteração.

Não assuma que "aumento" sempre significa algo positivo.

O significado da variação depende da métrica.

---

# 9. PERDAS E LEAKAGE

Uma plataforma de conciliação deve ajudar a empresa a encontrar dinheiro que está ficando para trás.

Sempre que os dados permitirem, criar visibilidade para:

- parcelas vencidas;
- parcelas não identificadas;
- pagamentos sem correspondência;
- divergências de valor;
- pagamentos duplicados;
- comprovantes inválidos;
- contratos com comportamento anormal;
- valores que deveriam ter sido recebidos e ainda não foram.

O conceito central é:

> Expected money vs. actual money.

Essa diferença deve ser visualmente evidente.

---

# 10. RECEBIDO VS PREVISTO

Este deve ser um conceito recorrente no produto.

Não mostrar apenas:

> R$ 500.000 recebidos.

Mostrar:

```text
Expected
R$ 560.000

Received
R$ 500.000

Gap
R$ 60.000
```

Quando possível, explicar o gap:

```text
R$ 35k overdue
R$ 15k pending reconciliation
R$ 10k unmatched
```

Isso transforma dados em diagnóstico.

---

# 11. AGING

Para contas a receber, considere uma visão de aging.

Exemplo:

```text
Current          R$ 320k
1–30 days        R$ 42k
31–60 days       R$ 18k
61–90 days       R$ 7k
90+ days         R$ 4k
```

Essa informação pode ser apresentada como:

- barras;
- distribuição;
- stacked visualization;
- indicadores;
- timeline.

Não precisa necessariamente ser uma tabela.

---

# 12. HEALTH DOS CONTRATOS

Contratos não devem ser apenas:

```text
Active
Pending
Finished
```

Quando os dados permitirem, representar sua saúde.

Exemplo:

```text
Healthy
At Risk
Overdue
Critical
```

A classificação pode considerar:

- pagamentos em dia;
- atraso;
- frequência de atraso;
- divergências;
- valor em aberto;
- proximidade de vencimento.

Não inventar regras de negócio sem dados.

Caso a regra ainda não exista, preparar a UI para suportar esse conceito sem afirmar algo que o backend não calcula.

---

# 13. INSIGHTS

Quando houver informação suficiente, apresentar insights contextuais.

Exemplo:

> "Recebimentos aumentaram 14% neste mês."

> "12 contratos concentram 47% dos valores em aberto."

> "O volume de parcelas em atraso caiu 8% nos últimos 30 dias."

> "R$ 24.500 em pagamentos aguardam conciliação."

Esses insights devem ser:

- baseados em dados reais;
- explicáveis;
- acionáveis.

Evite textos genéricos como:

> "Everything looks good!"

---

# 14. AÇÃO A PARTIR DO INSIGHT

Insights devem levar a ações.

Exemplo:

```text
R$ 24.500 aguardando conciliação

[ Revisar pagamentos ]
```

ou:

```text
8 contratos possuem parcelas vencidas

[ Ver contratos ]
```

O usuário deve conseguir sair de:

**informação → investigação → ação**

sem precisar navegar aleatoriamente pela aplicação.

---

# 15. DASHBOARD NÃO É O ÚNICO LUGAR PARA INTELIGÊNCIA

Não concentre todas as informações analíticas em uma página chamada Dashboard.

Inteligência deve aparecer contextualmente.

### Contrato

Mostrar:

- progresso financeiro;
- valor contratado;
- valor recebido;
- valor em aberto;
- histórico;
- atraso;
- previsão;
- saúde.

### Cliente

Mostrar:

- contratos;
- valor movimentado;
- pagamentos;
- atrasos;
- comportamento histórico.

### Parcelas

Mostrar:

- distribuição por status;
- vencimentos próximos;
- aging;
- valores em risco.

### Conciliação

Mostrar:

- taxa de sucesso;
- pendências;
- divergências;
- tempo de processamento;
- volume processado.

### Relatórios

Mostrar:

- tendências;
- comparativos;
- evolução;
- projeções;
- concentração;
- perdas.

---

# 16. VISUALIZAÇÕES

Não transforme tudo em tabela.

Escolha a visualização de acordo com a pergunta.

### Tabela

Quando o usuário precisa:

- procurar;
- comparar registros individuais;
- executar ações.

### KPI

Quando precisa:

- saber um número rapidamente.

### Line chart

Quando precisa:

- entender evolução temporal.

### Bar chart

Quando precisa:

- comparar categorias.

### Stacked bar

Quando precisa:

- entender composição.

### Progress

Quando precisa:

- entender progresso contra objetivo ou total.

### Distribution

Quando precisa:

- entender concentração ou aging.

### Timeline

Quando precisa:

- entender eventos ou fluxo.

### Area chart

Quando precisa:

- visualizar volume ao longo do tempo.

Não utilize gráficos apenas porque "gráficos deixam a tela bonita".

---

# 17. DENSIDADE ANALÍTICA

Uma tela profissional não deve possuir apenas:

```text
Título

[ Card ]
[ Card ]
[ Card ]

Tabela
```

Uma composição mais adequada pode ser:

```text
Page Header
│
├── Primary KPI / Current State
│
├── Trend / Comparison
│
├── Operational Attention
│
├── Financial Projection
│
└── Detailed Data
```

Cada bloco deve responder uma pergunta diferente.

---

# 18. HIERARQUIA DA INFORMAÇÃO

Priorize nesta ordem:

1. O que precisa da atenção do usuário;
2. Estado atual;
3. Impacto financeiro;
4. Tendência;
5. Projeção;
6. Detalhes;
7. Dados brutos.

Não coloque uma tabela enorme antes de explicar o que os dados significam.

---

# 19. CONTEXTUAL DATA

Quando estiver numa tela de detalhe, não mostre apenas os dados daquele registro.

Mostre contexto.

Exemplo:

Contrato:

```text
Contract value
R$ 120.000

Received
R$ 82.000

Remaining
R$ 38.000

Progress
68%

Expected completion
September
```

Depois:

```text
Payment history
Timeline
Upcoming installments
Issues
```

O usuário deve conseguir entender o contrato sem abrir cinco outras páginas.

---

# 20. NÃO INVENTAR DADOS

A UI deve ser rica, mas não deve fabricar informações.

Nunca criar:

- métricas sem fonte;
- projeções sem base;
- scores arbitrários;
- "AI insights" falsos;
- estatísticas fictícias apresentadas como reais.

Quando dados ainda não existem:

- criar estados empty;
- indicar que a métrica depende de histórico;
- mostrar estrutura futura;
- utilizar dados mock apenas em desenvolvimento.

A riqueza da UI deve vir da **modelagem do produto**, não de números inventados.

---

# 21. DESIGN PRINCIPLE

O produto deve parecer menos:

> "Sistema para cadastrar contratos e parcelas."

e mais:

> "Centro de controle financeiro dos contratos da empresa."

A diferença deve aparecer na interface.

A aplicação deve permitir ao usuário:

**monitorar → entender → prever → investigar → agir.**

Não apenas:

**cadastrar → consultar → editar → excluir.**

---

# 22. FINAL CHECK

Antes de implementar uma nova tela, pergunte:

### Operational

- O que o usuário precisa fazer?

### Analytical

- O que o usuário precisa entender?

### Financial

- Qual o impacto financeiro?

### Temporal

- Como isso está evoluindo?

### Comparative

- Isso está melhor ou pior?

### Predictive

- O que provavelmente acontecerá?

### Risk

- Onde existe risco?

### Action

- O que o usuário deveria fazer depois de perceber isso?

Se a tela responde apenas à primeira pergunta, provavelmente ela está funcional, mas ainda não está rica o suficiente como produto.

---

# PRINCÍPIO FINAL

Não adicione gráficos, métricas e cards apenas para deixar a interface bonita.

Adicione-os porque eles transformam:

**dados → contexto → decisão.**

O objetivo não é criar uma aplicação mais cheia.

É criar uma aplicação que faça o usuário pensar:

> "Eu consigo entender meu negócio olhando para essa tela."

Essa é a camada de inteligência que diferencia um sistema operacional de uma plataforma SaaS.