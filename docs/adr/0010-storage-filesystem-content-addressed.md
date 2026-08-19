# ADR-0010: Storage em filesystem endereçado por conteúdo, entregue via X-Accel-Redirect

**Status:** Aceito — implementado em v1 mínima (ver "Consequências")
**Data:** Agosto 2026 (spec v1.0 §3.4)

## Contexto

Sem AWS/S3 (ADR-0009), comprovantes precisam de um lugar durável e
seguro para viver em disco, sem depender de URL pré-assinada de nuvem
nem de caminho vindo diretamente de input do usuário (CLAUDE.md
invariante 12).

## Decisão

Comprovantes são persistidos em disco, endereçados por conteúdo:
`<tenant_id>/<aa>/<bb>/<content_hash>.<ext>`, nunca por caminho vindo
de input do usuário. Entrega protegida sem URL pré-assinada: a
aplicação autoriza e delega ao Nginx via `X-Accel-Redirect`, diretório
fora do webroot, permissão `0700`. Em dev, `./storage/receipts`; em
produção, `/var/lib/parciva/receipts` em volume dedicado.

## Alternativas consideradas

- **S3/bucket de nuvem gerenciada** — contraria ADR-0009.
- **Servir arquivo direto por rota pública com token na URL** — sem a
  garantia de `X-Accel-Redirect`, expõe mais superfície.

## Consequências

`src/shared/storage.ts` implementa uma v1 deliberadamente mínima:
escreve em arquivo temporário + `rename` atômico, sem o protocolo
completo de durabilidade (fsync do arquivo + fsync do diretório antes
do commit no banco) nem cifra em repouso ainda (LUKS + AES-256-GCM por
arquivo, planejado, não implementado). `storage_key` é sempre
construído com `/` (nunca `path.join` nativo) — bug real de dev no
Windows corrigido, que gravaria `\` e quebraria o path no Nginx em
produção (VPS Linux). `X-Accel-Redirect` em si ainda não está
implementado (dev não roda Nginx) — a rota de arquivo em produção
(`/t/<slug>/receipts/<id>/file`) hoje lê o buffer direto do disco, dívida
registrada, não corrigida (DECISIONS.md [19]).
