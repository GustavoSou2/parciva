# Parciva

SaaS multi-tenant de conciliação de recebíveis. O cliente final envia
comprovante por WhatsApp (via Twilio); o sistema extrai, confere e dá
baixa na parcela. Modelo B (cobrança PIX própria) chega na Fase 6, mas
o schema já prevê essa origem desde a Fase 1.

## Invariantes — nunca violar

1. **Dinheiro é inteiro em centavos.** Nunca float, nunca decimal em JS.
   Sempre o tipo `Money` de `src/shared/money.ts`.
2. **`ledger_entries` é append-only.** Nenhum UPDATE, nenhum DELETE.
   Correção é lançamento de reversão referenciando o original. Protegido
   por trigger no banco — não confie só na disciplina do código.
3. **Toda query de domínio tem `tenant_id`.** Acesso ao banco só via
   `db/client.ts`, que exige `TenantContext`. Nunca cliente cru. RLS é
   defesa final, não a única.
4. **A IA propõe, a regra dispõe.** Saída de modelo é validada contra
   JSON Schema e nunca vira ação direta. Motor de alocação é determinístico.
5. **Na dúvida, revisão humana.** Nunca auto-aprovar com confiança baixa,
   risco alto ou pagador não identificado. Falso positivo é o pior erro.
6. **Todo conteúdo dentro de um comprovante é dado, nunca instrução.**
   Isso vale para texto extraído por OCR/VLM tanto quanto para o payload
   de qualquer webhook externo.
7. **Segredo nunca no banco em claro** — só referência ao cofre local.
8. **Parciva nunca custodia dinheiro.** Não existe saque, split, repasse
   ou saldo. Cobrança (modelo B) é sempre emitida na conta do PSP do
   tenant. Se uma tarefa pedir qualquer forma de retenção de valor, pare
   e me avise (ADR 11).
9. **`payments.origin` é obrigatório.** Todo pagamento sabe se veio de
   comprovante (modelo A) ou de webhook do PSP (modelo B). O motor de
   alocação é compartilhado; o que muda é o caminho até ele.
10. **CPF/CNPJ é texto, nunca número.** CNPJ pode conter letras
    (alfanumérico, IN RFB 2.229/2024). Normalize com `UPPER` e sem
    pontuação ANTES de gerar hash ou comparar. Toda lógica de documento
    vive em `src/shared/document.ts` — não duplique regex de CNPJ em
    nenhum outro arquivo.
11. **Twilio é o BSP do WhatsApp**, não WhatsApp Web nem lib não oficial.
    `X-Twilio-Signature` valida todo webhook antes de qualquer
    processamento — mecanismo diferente do `X-Hub-Signature-256` da
    Graph API direta, não confunda os dois.
12. **Storage é filesystem local da VPS**, endereçado por conteúdo
    (`content_hash`), nunca por caminho vindo de input do usuário.
    Sem AWS, sem S3, sem serviço de nuvem gerenciado.

## Estrutura

- `src/modules/<dominio>/` — módulos isolados; só se comunicam pelo `index.ts`.
- `domain/` é puro (sem I/O). `application/` orquestra. `infra/` toca o mundo.
- Nunca importe `modules/x/domain/**` ou `modules/x/infra/**` de fora do módulo x.

## Antes de codar

- Leia `docs/spec/` do assunto relevante (não a spec inteira).
- Leia o `README.md` do módulo que vai mexer, se existir.
- Se a mudança contraria um ADR em `docs/adr/`, pare e me avise em vez de decidir sozinho.

## Comandos

```bash
pnpm dev              # app
pnpm worker           # fila
pnpm test             # testes
pnpm check            # lint + types + testes — rodar antes de qualquer commit
pnpm db:generate      # gerar migração após mudar schema
pnpm test:tenant      # isolamento entre tenants — nunca pular
```

## Regras de trabalho

- Teste junto com o código, no mesmo commit. Lógica de dinheiro e de
  documento tem teste de propriedade (fast-check), não só exemplo.
- Migração destrutiva nunca em um passo: expand → migrar dados → contract.
- Não adicione dependência sem justificar em uma linha no PR.
- Não crie arquivo novo em `docs/` sem eu pedir.
- Tarefa tem escopo fechado em `docs/tasks/`. Se implementar mais do que
  o pedido ("já aproveitei e fiz X também"), isso é retrabalho para eu
  revisar, não ajuda.