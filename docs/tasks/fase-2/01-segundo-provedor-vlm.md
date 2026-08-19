# Segundo provedor de VLM (Tier 3/4 da cascata)

**Módulo:** `src/modules/ingestion`
**Spec:** `docs/quitou-spec.md` §7.1 (Tier 3/4), §7.3 (arquitetura anti-lock-in)
**Depende de:** decisão do usuário de retomar gasto com LLM (DECISIONS.md [18] — adiado deliberadamente, "por enquanto só OCR")
**Decisões relevantes:** `docs/adr/0004-cascata-deterministico-primeiro.md`, `docs/adr/0007-provedor-ia-opt-out-treinamento.md` (checar opt-out de treinamento ANTES de adotar, não depois)

## Objetivo

Ligar Tier 3 (VLM barato) e Tier 4 (VLM premium) no worker de
ingestão, com uma interface `ExtractionProvider` plugável (anti-lock-in,
spec §7.3) — `infra/anthropic-vlm.ts` já existe no código, sem uso,
mas hoje é hardcoded, sem a interface que permitiria trocar de
provedor sem reescrever o worker.

## Critérios de aceite

- [ ] Confirmar com o usuário: qual segundo provedor (opt-out de
      treinamento verificado — ver ADR-0007, pré-condição, não ajuste
      posterior)
- [ ] Interface `ExtractionProvider` — `anthropic-vlm.ts` se adapta a
      ela, não é reescrito do zero
- [ ] Tier 3/4 ligados no worker, respeitando a cascata (só chamado
      se Tier 0–2 não resolverem)
- [ ] `receipt_extractions.cost_micros` passa a ser preenchido de
      verdade (hoje sempre `NULL` — sem custo de token a registrar)
- [ ] Orçamento por tenant / circuit breaker de custo (spec §7.5) —
      depende de billing real, que já existe (Fase 4) — decidir se
      entra nesta tarefa ou numa separada

## Fora de escopo

Corpus de ≥200 comprovantes reais com gabarito (banido do roadmap
desde o início — exige documento financeiro real de terceiro). Tier
1.5 (QR/BR Code EMV).
