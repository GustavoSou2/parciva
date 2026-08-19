# fraud

Primeira fatia da Fase 5 (spec §8) — consolida checks que já existiam
espalhados pelo código em um módulo real: `evaluateFraudChecks` (puro,
`domain/evaluate.ts`) pontua `amount_match`/`date_plausible`/`e2e_reuse`
e devolve `riskScore` (0–100) + `blocksAutoApply`. `recordFraudChecksTx`
grava uma linha por check em `fraud_checks` (RLS, `0017_fraud_checks_
rls.sql`) — só chamado dentro da transação de `executeReceiptPaymentTx`
(`reconciliation/infra/payment-repository.ts`).

**`e2e_reuse` é a única proteção nova de verdade** — antes desta fatia,
referência de transação repetida só era pega reativamente (violação de
índice único no insert). Agora é checado antes de decidir, e o insert
continua protegido pelo índice único como rede de segurança contra
corrida.

**Não faz** (fora desta fatia, ver DECISIONS.md): `PAYEE_MATCH`,
`E2E_FORMAT`, `INSTITUTION_KNOWN`, `LAYOUT_KNOWN` (resto da Camada A);
`EXIF_ANOMALY`/`PDF_PROVENANCE`/`ELA_HINT`/`FONT_ANOMALY` (Camada B
forense); Camada C (comportamento: `VELOCITY`/`HISTORY`/`AMOUNT_
PATTERN`/`PHONE_CHANGE`); Camada D (conciliação por extrato); perfil de
risco configurável por tenant — `DEFAULT_RISK_SCORE_THRESHOLD` é um
único número fixo por ora. `DUPLICATE_HASH`/`NEAR_DUPLICATE` continuam
fora deste módulo — são rejeitados em `ingestion/application/ingest-
receipt.ts` antes de existir `receiptId` pra referenciar aqui.
