# ADR-0009: Infraestrutura auto-hospedada em VPS própria, sem nuvem gerenciada

**Status:** Aceito
**Data:** Agosto 2026 (spec v1.0 §3.4)

## Contexto

O projeto é operado por uma pessoa, sem orçamento para serviços de
nuvem gerenciada (S3, RDS, etc.) além do estritamente necessário.
Toda decisão de infraestrutura parte da premissa de uma única VPS
rodando Postgres, Redis, a aplicação Next.js e os workers.

## Decisão

Sem AWS/S3/serviço de nuvem gerenciado em nenhuma camada. Postgres e
Redis rodam no mesmo host via `docker-compose.yml` (`infra/`);
storage de comprovante é filesystem local (ver ADR-0010); workers
compartilham CPU com o banco, por isso rodam com concorrência
explicitamente baixa (`concurrency: 1` no worker de comprovante —
OCR local disputa CPU com Postgres/Redis no mesmo host).

## Alternativas consideradas

- **S3/RDS/serviços gerenciados** — eliminaria trabalho operacional,
  mas contraria a decisão de custo zero de infraestrutura terceirizada
  e adiciona dependência de rede externa para operações centrais.

## Consequências

Capacidade de disco, backup, criptografia em repouso e throughput de
CPU compartilhada são responsabilidade explícita do projeto, não
terceirizadas. Em produção, a spec recomenda subir o worker para 2,5
GB de memória mantendo concorrência em 1 — trade-off de throughput por
estabilidade do host compartilhado (ver ADR-0004/ver DECISIONS.md
[10]).
