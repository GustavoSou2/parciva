# Design System — Product UI Guidelines

## 1. Objetivo

Você está construindo uma aplicação de produção, não um mockup de Dribbble ou um template genérico de SaaS.

A interface deve transmitir:

- produto maduro;
- alta qualidade visual;
- densidade de informação adequada;
- hierarquia visual clara;
- consistência;
- personalidade;
- sensação de aplicação realmente utilizada por usuários.

Priorize **usabilidade, hierarquia e composição** acima de efeitos decorativos.

---

# 2. REGRA PRINCIPAL

NUNCA use automaticamente o padrão:

> fundo branco + header + título + 3/4 cards de métricas + tabela dentro de um card + muito espaço vazio.

Esse é o padrão de fallback e deve ser evitado.

Antes de implementar uma tela, pense:

1. Qual é a informação mais importante?
2. Qual é a ação principal?
3. Quais informações precisam estar visualmente agrupadas?
4. Quais informações podem existir diretamente sobre o background?
5. Onde deve existir contraste?
6. Onde o usuário deve olhar primeiro?
7. Qual é a densidade de informação adequada para essa tela?

A composição deve ser definida antes dos componentes.

---

# 3. EVITE O "AI SaaS LOOK"

Não utilize automaticamente:

- excesso de cards;
- cards dentro de cards;
- grandes áreas vazias;
- sombras em todos os elementos;
- bordas excessivamente arredondadas;
- gradientes decorativos;
- ícones gigantes;
- títulos enormes sem necessidade;
- grids simétricos em excesso;
- dashboards compostos exclusivamente por cards;
- excesso de `border-radius`;
- excesso de `padding`;
- elementos centralizados sem necessidade;
- backgrounds completamente brancos em todas as áreas;
- componentes visualmente idênticos repetidos muitas vezes.

Não transforme cada seção em um card.

Cards devem existir para criar **hierarquia ou agrupamento**, não simplesmente porque existe uma seção.

---

# 4. DENSIDADE VISUAL

A aplicação deve possuir uma densidade de informação semelhante a produtos profissionais.

Evite tanto:

- interfaces apertadas e difíceis de ler;

quanto:

- interfaces que parecem vazias.

Use whitespace de forma **intencional**.

Espaçamento deve comunicar relacionamento entre elementos.

Elementos relacionados devem estar próximos.

Elementos pertencentes a grupos diferentes devem possuir separação visual clara.

Não adicione `padding: 32px`, `gap: 24px` ou `margin-bottom: 32px` simplesmente por padrão.

Escolha espaçamentos de acordo com a hierarquia da informação.

---

# 5. COMPOSIÇÃO

Não faça todas as telas seguindo o mesmo grid.

Use diferentes composições quando fizer sentido:

- layouts assimétricos;
- colunas com diferentes proporções;
- áreas principais + áreas auxiliares;
- listas laterais;
- painéis contextuais;
- seções horizontais;
- tabelas combinadas com resumo;
- timeline;
- activity feed;
- métricas incorporadas ao conteúdo;
- blocos de informação diretamente no background.

A interface deve parecer desenhada para o conteúdo que apresenta.

Não force o conteúdo a caber em um template.

---

# 6. SUPERFÍCIES

Não utilize apenas:

`background → white card → white card → white card`

Utilize níveis de superfície.

Exemplo conceitual:

```text
Application Background
    ↓
Section / Workspace
    ↓
Surface
    ↓
Elevated Surface
```

As superfícies podem ser diferenciadas através de:

- background;
- border;
- contraste;
- tipografia;
- espaçamento;
- elevação sutil.

Nem toda diferença precisa de sombra.

Prefira bordas e diferenças sutis de superfície quando possível.

---

# 7. CORES

Utilize uma paleta consistente.

Defina semanticamente:

- background;
- foreground;
- surface;
- surface-muted;
- border;
- primary;
- secondary;
- success;
- warning;
- danger;
- info;
- muted text.

Não invente novas cores em cada componente.

Não utilize cores apenas para "deixar bonito".

Cores devem comunicar:

- estado;
- importância;
- ação;
- hierarquia;
- contexto.

A cor primária deve ser usada estrategicamente.

Evite interfaces onde tudo possui a mesma cor de destaque.

---

# 8. TIPOGRAFIA

A tipografia deve possuir hierarquia clara.

Utilize níveis distintos para:

- page title;
- section title;
- heading;
- body;
- secondary text;
- metadata;
- labels;
- numbers;
- status.

Números importantes podem ter destaque, mas não transforme toda métrica em um número gigante.

Evite:

```text
48px TITLE
36px NUMBER
24px SUBTITLE
```

sem necessidade.

A hierarquia deve ser baseada em contexto.

---

# 9. BORDER RADIUS

Não arredonde tudo.

Use poucos níveis consistentes de radius.

Exemplo:

```text
small   → controles pequenos
medium  → inputs / buttons
large   → containers / cards
```

Componentes que pertencem ao mesmo grupo devem compartilhar o mesmo comportamento de radius.

Evite transformar a aplicação inteira em uma coleção de "pílulas".

---

# 10. SOMBRAS

Sombras devem representar elevação.

Não utilize sombra em:

- toda tabela;
- todo card;
- todo botão;
- todo input;
- toda seção.

Priorize:

```text
border + surface contrast
```

antes de:

```text
box-shadow
```

Use sombra principalmente quando um elemento realmente estiver acima de outro:

- dropdown;
- modal;
- popover;
- floating panel;
- tooltip;
- command menu.

---

# 11. BOTÕES

Botões devem possuir hierarquia.

Tipos:

- Primary;
- Secondary;
- Ghost;
- Destructive;
- Link;
- Icon button.

Não transforme todas as ações em Primary.

Uma tela normalmente deve possuir uma ação visualmente dominante.

Ações secundárias devem permanecer secundárias.

---

# 12. CARDS

Cards não são obrigatórios.

Use card quando ele ajudar a:

- agrupar informação;
- criar separação;
- representar uma entidade;
- destacar uma informação;
- criar uma superfície independente.

Não use card simplesmente porque existe uma seção.

Evite:

```text
Card
  Card
    Card
```

e:

```text
Card
Card
Card
Card
Card
Card
```

quando uma composição mais natural resolveria o problema.

---

# 13. TABELAS

Tabelas devem parecer ferramentas de trabalho, não planilhas decorativas.

Priorize:

- densidade;
- alinhamento;
- leitura rápida;
- estados;
- ações contextuais;
- hierarquia entre colunas;
- números alinhados corretamente;
- headers discretos;
- row hover;
- feedback de seleção.

Evite colocar a tabela dentro de um card enorme com padding excessivo.

Quando apropriado, permita que a tabela utilize praticamente toda a largura disponível.

---

# 14. FORMULÁRIOS

Formulários devem priorizar velocidade e clareza.

Agrupe campos relacionados.

Não coloque cada input dentro de um card.

Evite layouts excessivamente verticais quando os campos puderem ser organizados horizontalmente.

Use:

- labels claros;
- descrição contextual;
- validação próxima ao campo;
- estados de erro;
- estados de sucesso;
- estados disabled;
- feedback imediato quando necessário.

---

# 15. DASHBOARDS

Dashboards não devem ser apenas uma coleção de KPIs.

Um dashboard deve responder:

1. O que está acontecendo?
2. O que mudou?
3. O que precisa da minha atenção?
4. O que eu posso fazer agora?

Priorize:

- informação relevante;
- atividade recente;
- alertas;
- tendências;
- ações;
- contexto.

Uma métrica sem contexto possui pouco valor.

Evite automaticamente criar:

```text
Revenue
Users
Orders
Conversion
```

como quatro cards idênticos.

---

# 16. NAVEGAÇÃO

A navegação deve ser simples e previsível.

Sidebar, topbar ou navegação contextual devem possuir propósito.

Não adicione:

- menus;
- breadcrumbs;
- tabs;
- filtros;
- submenus

sem necessidade.

Utilize progressive disclosure quando houver complexidade.

Informações menos importantes podem aparecer apenas quando necessárias.

---

# 17. ÍCONES

Ícones devem complementar texto.

Não use ícones apenas para preencher espaço.

Mantenha:

- tamanho consistente;
- stroke consistente;
- alinhamento consistente;
- significado semântico.

Evite ícones gigantes utilizados apenas como decoração.

---

# 18. ESTADOS

Todo componente interativo deve considerar:

- default;
- hover;
- focus;
- active;
- disabled;
- loading;
- error;
- empty;
- success.

Estados vazios devem ser úteis.

Não mostre simplesmente:

> "No data"

Explique:

- o que aconteceu;
- por que está vazio;
- o que o usuário pode fazer.

---

# 19. RESPONSIVIDADE

Não trate mobile como uma versão menor do desktop.

Defina como a informação deve ser reorganizada.

Em telas menores:

- reduza elementos secundários;
- reorganize colunas;
- transforme tabelas quando necessário;
- preserve ações importantes;
- evite simplesmente diminuir tudo.

A hierarquia deve permanecer intacta.

---

# 20. ANIMAÇÕES

Animações devem comunicar mudança de estado.

Utilize animações sutis para:

- entrada;
- saída;
- expansão;
- seleção;
- loading;
- feedback.

Não adicione animações apenas para impressionar.

Evite interfaces que parecem apresentações de PowerPoint.

---

# 21. CONSISTÊNCIA

Antes de criar um novo componente, procure componentes existentes.

Não crie:

```text
Button2
ButtonNew
CustomButton
PrimaryButtonV2
```

se um componente existente puder ser reutilizado.

Centralize:

- tokens;
- cores;
- spacing;
- typography;
- radius;
- shadows;
- componentes.

A aplicação deve parecer construída por uma única equipe de design.

---

# 22. REUTILIZAÇÃO SEM MONOTONIA

Consistência não significa que todas as telas devem parecer iguais.

Mantenha consistente:

- tipografia;
- cores;
- componentes;
- espaçamento;
- interação;
- estados.

Permita variar:

- composição;
- proporções;
- distribuição;
- densidade;
- agrupamento;
- estrutura.

O design system define as regras.

Ele não deve transformar todas as telas em clones.

---

# 23. ANTES DE CODIFICAR UMA NOVA TELA

Antes de escrever o código, faça mentalmente esta análise:

### Content hierarchy

Qual é:

- informação primária?
- informação secundária?
- ação primária?
- ação secundária?
- contexto?
- informação auxiliar?

### Layout

Determine:

- estrutura da página;
- largura das áreas;
- agrupamento;
- superfícies;
- densidade;
- responsividade.

### Visual hierarchy

Determine:

- onde o usuário olha primeiro;
- onde olha depois;
- quais elementos possuem maior contraste;
- quais elementos devem ser discretos.

Somente depois implemente os componentes.

---

# 24. REGRA CONTRA ESPAÇO VAZIO

Espaço vazio é permitido quando melhora:

- legibilidade;
- hierarquia;
- foco;
- separação;
- compreensão.

Espaço vazio NÃO deve existir porque:

> "o componente precisa respirar."

Se uma tela possui grandes áreas sem conteúdo, questione se:

- o layout está usando a largura disponível;
- informações poderiam ser agrupadas;
- uma segunda coluna seria útil;
- uma seção contextual poderia ocupar o espaço;
- o componente está com padding excessivo.

Não preencha espaço vazio artificialmente.

Mas também não desperdice espaço útil.

---

# 25. REGRA DE OURO

Ao terminar uma tela, pergunte:

> "Essa interface parece um produto real usado diariamente ou parece um template de SaaS gerado por IA?"

Se parecer um template genérico, revise a composição.

Procure:

- reduzir cards;
- melhorar contraste;
- aumentar densidade;
- melhorar hierarquia;
- utilizar melhor o viewport;
- remover elementos decorativos;
- criar agrupamentos mais naturais;
- dar maior personalidade ao layout.

O objetivo final é:

**menos template, mais produto.**

**menos decoração, mais hierarquia.**

**menos espaço desperdiçado, mais informação útil.**

**menos componentes isolados, mais composição.**

**menos "AI-generated SaaS", mais software de produção.**