# whatsapp

Recebe o webhook do Twilio (canal WhatsApp, spec §9.2), valida a
assinatura, classifica a mensagem (texto vs mídia) e, para mídia, baixa
o arquivo e enfileira como `RawReceipt` do módulo `ingestion`.

**Invariantes locais:** `X-Twilio-Signature` valida antes de qualquer
outro passo (CLAUDE.md invariante 11); mídia é baixada imediatamente
após o parse — a URL do Twilio é temporária e expira.

**Não faz:** não gera/envia TwiML (resposta via `sendReply` injetado);
não gerencia estado de conversa (§9.3, tarefa futura); só modela os
campos de `TwilioInboundMessage`, não o payload completo do Twilio
(ver nota em `application/handle-inbound.ts`).
