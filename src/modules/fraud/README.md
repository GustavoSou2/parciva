# fraud

Primeira fatia da Fase 5 (spec §8) — consolida checks que já existiam
espalhados pelo código em um módulo real: `evaluateFraudChecks` (puro,
`domain/evaluate.ts`) pontua `amount_match`/`date_plausible`/`e2e_reuse`
(Camada A/B, `fail`/`pass`) e `velocity`/`history`/`amount_pattern`/
`phone_change` (Camada C, `warn`/`pass`, DECISIONS.md [35]), devolvendo
`riskScore` (0–100) + `blocksAutoApply`. `recordFraudChecksTx` grava uma
linha por check em `fraud_checks` (RLS, `0017_fraud_checks_rls.sql`) —
só chamado dentro da transação de `executeReceiptPaymentTx`
(`reconciliation/infra/payment-repository.ts`).

**`e2e_reuse` é a única proteção nova de verdade** — antes desta fatia,
referência de transação repetida só era pega reativamente (violação de
índice único no insert). Agora é checado antes de decidir, e o insert
continua protegido pelo índice único como rede de segurança contra
corrida.

**Camada C (comportamento, DECISIONS.md [35]) tem pool de peso próprio,
separado de Camada A/B** (`BEHAVIORAL_CHECK_WEIGHTS`,
`BEHAVIORAL_MAX_CONTRIBUTION` em `domain/evaluate.ts`) — soma até 30
pontos ao score, sempre abaixo de `DEFAULT_RISK_SCORE_THRESHOLD`, nunca
em `FORCES_REVIEW`. Os 4 checks são resolvidos em `domain/behavior.ts`
(puro) a partir de agregados que `infra/behavior-repository.ts` busca
na mesma transação de `payment-repository.ts` (contagem de pagamentos
recentes/anteriores do pagador, média das próprias parcelas, contagem
de outros pagadores com o mesmo valor). `phone_change` usa
`ReceiptPaymentInput.fromPhone`/`payerPhoneE164`, repassados desde
`process-receipt-extraction.ts` (antes descartados após a
identificação).

**Não faz** (fora desta fatia, ver DECISIONS.md): `PAYEE_MATCH`,
`E2E_FORMAT`, `INSTITUTION_KNOWN`, `LAYOUT_KNOWN` (resto da Camada A);
`EXIF_ANOMALY`/`PDF_PROVENANCE`/`ELA_HINT`/`FONT_ANOMALY` (Camada B
forense); Camada D (conciliação por extrato); perfil de risco
configurável por tenant — `DEFAULT_RISK_SCORE_THRESHOLD` é um único
número fixo por ora, e os limiares/pesos de Camada C (`VELOCITY_*`/
`HISTORY_*`/`AMOUNT_PATTERN_*` em `domain/behavior.ts`) são decisão
nova desta fatia, não vêm da spec. `DUPLICATE_HASH`/`NEAR_DUPLICATE`
continuam fora deste módulo — são rejeitados em `ingestion/application/
ingest-receipt.ts` antes de existir `receiptId` pra referenciar aqui.
