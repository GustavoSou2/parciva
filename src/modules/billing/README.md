# billing

Limites de plano (spec §11.1) e enforcement de cota (spec §11.3):
`checkQuota`/`isFeatureEnabled` são regras puras; `enforceQuota` é o
caso de uso chamado no *enqueue* e de novo no *worker*, para evitar
corrida com troca de plano.

**Invariantes locais:** cota rígida — `allowed: false` no limite exato,
não só acima dele. `incrementUsage` só roda depois de `checkQuota`
confirmar `allowed`; a persistência transacional
(`INSERT ... ON CONFLICT DO UPDATE`) é responsabilidade de quem
implementa `EnforceQuotaDeps`, não deste módulo.

**Não faz:** não cobra excedente nem gera fatura — só decide
permitir/bloquear. Sem I/O em `domain/`.
