import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { logger } from "./logger";

function lastCall(spy: ReturnType<typeof vi.spyOn>): unknown {
  const calls = spy.mock.calls;
  const lastArgs = calls[calls.length - 1];
  if (!lastArgs) throw new Error("Nenhuma chamada registrada no spy.");
  return JSON.parse(lastArgs[0] as string);
}

describe("logger", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  const originalLogLevel = process.env.LOG_LEVEL;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    if (originalLogLevel === undefined) delete process.env.LOG_LEVEL;
    else process.env.LOG_LEVEL = originalLogLevel;
  });

  it("info emite uma linha JSON com level/message/timestamp em console.log", () => {
    logger.info("mensagem de teste", { receiptId: "abc-123" });

    expect(logSpy).toHaveBeenCalledTimes(1);
    const parsed = lastCall(logSpy) as Record<string, unknown>;
    expect(parsed.level).toBe("info");
    expect(parsed.message).toBe("mensagem de teste");
    expect(typeof parsed.timestamp).toBe("string");
    expect(parsed.receiptId).toBe("abc-123");
  });

  it("warn e error vão para console.error, não console.log", () => {
    logger.warn("aviso");
    logger.error("falha");

    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledTimes(2);
  });

  it("error serializa Error (name/message/stack) — JSON.stringify(new Error()) sozinho vira {}", () => {
    const boom = new Error("algo quebrou");
    logger.error("falha ao processar", { error: boom, receiptId: "xyz" });

    const parsed = lastCall(errorSpy) as { error: { name: string; message: string; stack: string } };
    expect(parsed.error.name).toBe("Error");
    expect(parsed.error.message).toBe("algo quebrou");
    expect(typeof parsed.error.stack).toBe("string");
  });

  it("LOG_LEVEL=warn silencia debug e info", () => {
    process.env.LOG_LEVEL = "warn";
    logger.debug("não deveria aparecer");
    logger.info("também não deveria aparecer");
    logger.warn("este sim");

    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it("sem LOG_LEVEL configurado, default é info — debug fica silencioso, info não", () => {
    delete process.env.LOG_LEVEL;
    logger.debug("silencioso por default");
    logger.info("aparece por default");

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect((lastCall(logSpy) as { message: string }).message).toBe("aparece por default");
  });
});
