# Prompt de Refatoração de UI — v6 "Confiança Viva" (Rodada 6 — densidade, risco e rail universal)

> Fonte única de verdade: `DESIGN.md`, `quitou.tokens.json`, `quitou.theme.css` v6 atual. `CHANGELOG.md` é histórico — uma linha "✓" de rodada anterior não vale contra o que o `DESIGN.md` diz hoje, principalmente porque esta rodada **revisa uma decisão anterior** (fundo sólido de card, §2.5/§7.8).
> Contexto: as Rodadas 1–5 já cobriram cor de marca, navegação, arquitetura de duas/três camadas e vocabulário de estado. A verificação visual real (print de Contratos) revelou dois problemas que nenhuma rodada anterior via: (1) fundo sólido de card em lista onde todo item compartilha o mesmo estado vira bloco de cor sem sinalizar nada; (2) mesmo com a camada de resumo certa, a tela seguia "pobre de informação" e com espaço vazio sobrando. Esta rodada corrige os dois e adiciona a primeira camada real de inteligência de negócio.

---

## 0. Antes de tudo — confirmar o que já está feito

Não refazer: migração de cor de marca (Rodadas 3–5), topbar com seletor de tenant real, sidebar em grupos, hero do Painel, vocabulário de estado de contrato/pagador, composição sutil em telas de auth, selo de tendência + sparkline em "Recebido hoje"/"Taxa de automação". Se alguma varredura encontrar regressão nessas áreas, reportar antes de seguir — mas o foco desta rodada é o que vem abaixo.

## 1. Correção — fundo sólido de card em lista densa (§2.5 revisado, §7.8)

Onde uma lista mostra múltiplas entidades e hoje o card inteiro tem fundo pastel de estado (ex.: Contratos, todos os cards `ativo` em fundo verde sólido): reverter pra pílula de estado pequena (mesma paleta, só como pílula, não como fundo de linha inteira). Fundo sólido de card continua válido **só** em card único em destaque (ex.: cartão de parcela vencendo, se ainda existir esse padrão) — nunca em lista com mais de um item do mesmo tipo.

## 2. Densidade mínima por linha de entidade (§7.8)

Para Contratos, Pagadores, Extrato (linhas de transação/import) — cada linha precisa ter no mínimo 4–5 campos, não só nome+valor+status:
- Contraparte (avatar/inicial em chip, reaproveitando `chip-1..4`).
- Data relevante de próxima ação (próximo vencimento, criado em, ou equivalente real do schema — não inventar campo que não existe).
- Ação rápida (`•••`) visível na linha.

Antes de reportar "campo não existe": confira o schema completo da entidade, não só os campos que a query atual da tela já seleciona — é comum a tabela ter a coluna e a query da lista simplesmente não pedir ela ainda (isso é o caso mais provável, dado o padrão de todo o resto desta sessão: o dado geralmente existe, só nunca foi puxado pra essa tela específica). Se de fato não existir em lugar nenhum do schema, aí sim reportar como bloqueio.

## 3. Camada de risco e projeção (§7.9) — primeira rodada de inteligência de negócio

- **Card "Valor em risco"** no Painel: soma de parcelas vencidas + parcelas de contratos com pagador historicamente inadimplente. Cor `tendencia-baixa` no número, sempre com composição ao lado ("X contratos, Y pagadores"). Se o cálculo de "pagador historicamente inadimplente" não existir ainda (precisa de agregação por taxa de atraso), construir a versão simples primeiro (soma de parcelas vencidas hoje) e reportar a versão completa como próximo passo — não bloquear a rodada inteira por isso.
- **Selo de risco por pagador**: ao lado do nome, em Pagadores e no detalhe de pagador (§4.7.1) — baseado em taxa histórica real de atraso ("atrasou 3 de 8"). Usa `tendencia-baixa`/`tendencia-alta`, nunca cor de estado.
- **Projeção de recebimento 30/60/90 dias**: só construir se o dado histórico já existir de forma acessível sem agregação nova cara. Se faltar, reportar como bloqueio — não é passo obrigatório desta rodada, é o que temos mais confiança que pode ficar pra depois.

## 4. Rail lateral universal (§4.7.2)

Para cada tela abaixo, adicionar rail (296px) **só se houver widget de contexto real** — não construir rail vazio. **Antes de reportar "sem widget real pra essa tela", esgote as fontes de dado já existentes**: olhe todo módulo/tabela que já é lido em algum lugar do produto pra essa entidade (ex.: se `Pagadores` já busca histórico de pagamento em algum outro fluxo, esse dado existe e pode virar widget de rail, mesmo que a tela de lista hoje não o exiba). "Esgotar antes de desistir" é diferente de "inventar quando não achar" — o critério continua sendo dado real, só que a busca por esse dado precisa ser de fato completa, não parar na primeira tentativa óbvia.

| Tela | Widget |
|---|---|
| Painel | Card "Valor em risco" (item 3), lista "vencendo essa semana" |
| Contratos | "Vencendo nos próximos 7 dias", taxa de contratos em dia vs. atraso |
| Pagadores | Ranking de pagadores com mais atraso histórico (§2.8/§7.6 — primeira lista real ordenada por valor que qualifica pra medalha) |
| Extrato | Resumo de conciliação do período (linhas casadas vs. pendentes) |
| Detalhe de contrato/pagador | Linha do tempo de pontualidade (mini sparkline), selo de risco |

Se para alguma tela não houver widget real disponível sem inventar agregação nova, reportar e deixar sem rail — isso é resposta válida, não falha.

## 5. Checklist de recusas — revisar com os itens desta rodada

- Fundo sólido de card em lista com múltiplos itens do mesmo estado: banido (correção do item 1). ✓/✗
- Linha de entidade com menos de 4–5 campos quando o dado já existe no schema: banido. ✓/✗
- Score/selo de risco sem composição explicada ao lado: banido. ✓/✗
- Rail vazio ou decorativo: banido — só com widget real. ✓/✗
- Esticar lista/tabela pra ocupar espaço em vez de usar rail: banido. ✓/✗
- Demais recusas v6 (grid uniforme, tenant escondido, movimento sem gatilho, raio > 16px, donut de composição, confete, serifa): sem alteração, revisar mesmo assim. ✓/✗

## 6. Entregável

`CHANGELOG.md`, "Rodada 6 — densidade, risco e rail universal". Reportar cada bloqueio (dado de risco não calculável, campo inexistente no schema) em vez de contornar com invenção. **Verificação visual real obrigatória de novo** — o print de Contratos foi o que revelou os dois problemas desta rodada; sem novo print, não há confirmação de que a correção funcionou.