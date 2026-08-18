/**
 * Logger estruturado — Marco 6 do roadmap (PROGRESS.md: "src/shared/
 * logger.ts não existe... tudo é console.log/console.error direto").
 * Hand-rolled de propósito: nenhuma lib de log (pino/winston) instalada
 * hoje, mesmo espírito de `Result`/`Money` — abstração pequena com
 * racional em comentário, não dependência nova pra um problema pequeno.
 *
 * Não esconde o `console`: só padroniza o formato (uma linha JSON por
 * chamada) e o nível. `debug`/`info` vão para stdout (`console.log`),
 * `warn`/`error` para stderr — mesma convenção de qualquer processo
 * Unix. `LOG_LEVEL` (env, default "info") filtra o que sai — permite
 * silenciar `debug` em produção sem mudar código.
 *
 * Escopo desta tarefa: migra processos de produção contínua (workers,
 * rotas de API/webhook) e o código de domínio que eles chamam — nunca
 * scripts de CLI de uso manual (`db/seed.ts`, `db/migrate.ts`), onde
 * `console.log` cru continua mais legível pra um humano no terminal.
 */

const LEVEL_WEIGHT = { debug: 0, info: 1, warn: 2, error: 3 } as const;

export type LogLevel = keyof typeof LEVEL_WEIGHT;

export type LogContext = Record<string, unknown>;

function minLevel(): LogLevel {
  const configured = process.env.LOG_LEVEL;
  return configured && configured in LEVEL_WEIGHT ? (configured as LogLevel) : "info";
}

/** `JSON.stringify(new Error())` vira "{}" — serializa os campos que importam à mão. */
function serializeError(error: unknown): unknown {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  return error;
}

function log(level: LogLevel, message: string, context?: LogContext): void {
  if (LEVEL_WEIGHT[level] < LEVEL_WEIGHT[minLevel()]) return;

  const { error, ...rest } = context ?? {};
  const line = JSON.stringify({
    level,
    message,
    timestamp: new Date().toISOString(),
    ...rest,
    ...(error !== undefined ? { error: serializeError(error) } : {}),
  });

  if (level === "warn" || level === "error") {
    console.error(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  debug(message: string, context?: LogContext): void {
    log("debug", message, context);
  },
  info(message: string, context?: LogContext): void {
    log("info", message, context);
  },
  warn(message: string, context?: LogContext): void {
    log("warn", message, context);
  },
  error(message: string, context?: LogContext & { error?: unknown }): void {
    log("error", message, context);
  },
};
