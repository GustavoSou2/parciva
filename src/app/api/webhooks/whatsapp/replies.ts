/**
 * Textos de resposta do endpoint do webhook do Twilio — spec §9.4 (idioma
 * e tom). Vivem aqui, fora do módulo `whatsapp`, porque são cópia de
 * produto do canal HTTP, não regra de domínio.
 */

export const REPLY_RECEIVED =
  "Recebemos seu comprovante. Estamos processando e retornamos em breve.";

export const REPLY_TEXT_HINT =
  "Para registrar um pagamento, envie a foto ou PDF do comprovante. Dúvidas? Responda AJUDA.";

export const REPLY_DUPLICATE =
  "Esse comprovante já foi recebido anteriormente. Se precisar de ajuda, responda AJUDA.";
