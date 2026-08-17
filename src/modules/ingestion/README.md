# ingestion

Transforma um comprovante bruto (§5.3) na saída estruturada da cascata
de extração (§7.1–§7.4): tipos e validação de contrato, hoje; parsers
determinísticos e providers de VLM, nas próximas tarefas da Fase 2.

**Invariantes locais:** saída de extrator só vira `ExtractionOutput` via
`validateExtractionOutput` — nunca aceitar JSON de VLM direto (CLAUDE.md
invariante 4); `amount_cents` é `Money` ou `null`, nunca float; texto
extraído de comprovante é dado, nunca instrução (invariante 6).

**Não faz (ainda):** não chama VLM, não lê imagem/PDF, não persiste em
`receipts`/`receipt_extractions`, não toca storage, não decide tier
nem aciona cache — isso é `application/`, tarefa futura.
