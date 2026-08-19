# ADR-0014: Documento (CPF/CNPJ) é texto normalizado, nunca tipo numérico

**Status:** Aceito
**Data:** Agosto 2026 (spec v1.0 §5.6; implementado em `0bd9205`)

## Contexto

A IN RFB nº 2.229/2024 introduz CNPJ alfanumérico (12 primeiras
posições aceitam letras A–Z, 2 dígitos verificadores continuam
numéricos), com início de emissão previsto para meados de 2026. CNPJs
numéricos já emitidos continuam válidos indefinidamente. Tratar
documento como número em qualquer ponto do sistema quebra com letras e
já era errado antes disso (zero à esquerda).

## Decisão

Documento é sempre texto — nunca `BIGINT`/`NUMERIC`/`int` em nenhuma
coluna, DTO, JSON ou variável — implementado em
`src/shared/document.ts`, único módulo autorizado a conter lógica de
CPF/CNPJ (CLAUDE.md invariante 10). Normalização (remover pontuação,
`UPPER`) acontece sempre antes de hash ou comparação. Dígito
verificador alfanumérico usa módulo 11 com `ASCII − 48` por caractere.
Validação aceita os dois formatos (numérico e alfanumérico) desde já.
Constraint de banco reforça o formato: `CHECK (document ~
'^[0-9A-Z]{11,14}$')`.

## Alternativas consideradas

- **Esperar a vigência oficial do formato alfanumérico** — rejeitado;
  a spec identifica esse atraso como o bug mais provável da área
  (rejeitar CNPJ com letra por "formato inválido" é pagador legítimo
  recusado, não erro visível).
- **Duplicar regex de CNPJ em múltiplos arquivos** — proibido
  explicitamente (CLAUDE.md invariante 10).

## Consequências

Todo código que compara ou faz hash de documento precisa importar de
`src/shared/document.ts`, nunca reimplementar. O corpus de teste do
pipeline de extração precisaria incluir casos sintéticos com CNPJ
alfanumérico — pendência real, não existe `corpus/` no repositório
(mesma limitação do ADR-0004).
