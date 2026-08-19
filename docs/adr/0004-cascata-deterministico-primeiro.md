# ADR-0004: Cascata determinístico-primeiro para extração

**Status:** Aceito
**Data:** Agosto 2026 (spec v1.0 §7.1)

## Contexto

Comprovante de PIX brasileiro é altamente estruturado. Tratar extração
como "problema de IA" desde o primeiro tier significa pagar caro
(tokens de VLM) por algo que regex resolve, e depender de
disponibilidade de provedor externo para o caminho mais comum.

## Decisão

Cascata de 6 tiers, cada um só chamado se o anterior falhar ou tiver
confiança insuficiente: (0) cache por `content_hash`/`perceptual_hash`,
(1) PDF com camada de texto + regex, (1.5) QR/BR Code, (2) OCR local
(Tesseract) + regex, (3) VLM barato, (4) VLM premium, (5) revisão
humana. `receipts.status`/`receipt_extractions` gravam qual tier
resolveu e a confiança por campo.

## Alternativas consideradas

- **Enviar toda imagem direto para VLM** — mais simples de implementar,
  mas caro em escala e cria dependência total de provedor externo.

## Consequências

Corpus de teste versionado com comprovantes reais anonimizados seria o
ativo técnico mais valioso do projeto — segue sem existir (nenhum
diretório `corpus/`), documento financeiro de terceiro está banido do
roadmap desde o início.

Tier 3/4 (VLM) segue implementado no código (`infra/anthropic-vlm.ts`)
mas nunca ligado ao worker — decisão explícita do usuário de não
gastar com LLM por ora (DECISIONS.md [18]). Todo comprovante que Tiers
0–2 não resolvem cai direto em revisão humana; a cascata "maioria nunca
chega a um LLM" está, na prática atual, resolvida por revisão humana
em vez de VLM, não pelo desenho original da cascata — reavaliar quando
o segundo/terceiro tier de IA for retomado.
