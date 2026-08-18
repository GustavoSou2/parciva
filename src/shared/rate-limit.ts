/**
 * Rate limit por janela fixa (INCR + EXPIRE) — spec §10.2, login:
 * "5/min e 20/h, com backoff". `ioredis` já é dependência direta do
 * projeto (BullMQ) — reusa a mesma infra em vez de nova dependência ou
 * solução em memória (que não sobrevive a múltiplos processos/reinício
 * do worker/app, ao contrário de um contador compartilhado no Redis).
 *
 * Janela fixa, não sliding window — mais simples, suficiente pra um
 * limite de tentativas de login (não é rate limit de API de alto
 * volume, onde o efeito de borda da janela fixa importa mais).
 */

import Redis from "ioredis";

let client: Redis | undefined;

function getClient(): Redis {
  if (!client) {
    const url = process.env.REDIS_URL;
    if (!url) throw new Error("REDIS_URL não configurado.");
    client = new Redis(url);
  }
  return client;
}

export interface RateLimitResult {
  readonly allowed: boolean;
  readonly remaining: number;
}

/** `key` já deve incluir o escopo (ex.: `login:ip:1.2.3.4` ou `login:email:x@y.com`) — este módulo não monta a chave. */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const redis = getClient();
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, windowSeconds);
  }
  return { allowed: count <= limit, remaining: Math.max(0, limit - count) };
}
