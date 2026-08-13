import { describe, expect, it } from "vitest";
import { transition } from "./conversation";

describe("transition — idle", () => {
  it("idle + MEDIA_RECEIVED → processing com reply de recebido", () => {
    const result = transition("idle", { type: "MEDIA_RECEIVED" });
    expect(result.next).toBe("processing");
    expect(result.reply).toBe(
      "Recebemos seu comprovante. Estamos processando e retornamos em breve.",
    );
  });

  it("idle + TEXT_RECEIVED → idle com hint de como enviar comprovante", () => {
    const result = transition("idle", { type: "TEXT_RECEIVED", body: "oi" });
    expect(result.next).toBe("idle");
    expect(result.reply).toBe(
      "Para registrar um pagamento, envie a foto ou PDF do comprovante. Dúvidas? Responda AJUDA.",
    );
  });

  it("idle + TEXT_RECEIVED 'AJUDA' → idle com mensagem de suporte", () => {
    const result = transition("idle", { type: "TEXT_RECEIVED", body: "AJUDA" });
    expect(result.next).toBe("idle");
    expect(result.reply).not.toBeNull();
    expect(result.reply).not.toBe(
      "Para registrar um pagamento, envie a foto ou PDF do comprovante. Dúvidas? Responda AJUDA.",
    );
  });
});

describe("transition — processing", () => {
  it("processing + PROCESSING_DONE (automated) → confirmed sem reply", () => {
    const result = transition("processing", { type: "PROCESSING_DONE", automated: true });
    expect(result.next).toBe("confirmed");
    expect(result.reply).toBeNull();
  });

  it("processing + PROCESSING_DONE (não automated) → under_review sem reply", () => {
    const result = transition("processing", { type: "PROCESSING_DONE", automated: false });
    expect(result.next).toBe("under_review");
    expect(result.reply).toBeNull();
  });

  it("processing + PROCESSING_FAILED → failed com reply de erro", () => {
    const result = transition("processing", { type: "PROCESSING_FAILED" });
    expect(result.next).toBe("failed");
    expect(result.reply).toBe(
      "Não conseguimos processar seu comprovante. Tente enviar novamente ou responda AJUDA.",
    );
  });
});

describe("transition — transição inválida", () => {
  it("confirmed + MEDIA_RECEIVED → confirmed sem reply (estado terminal ignora o evento)", () => {
    const result = transition("confirmed", { type: "MEDIA_RECEIVED" });
    expect(result.next).toBe("confirmed");
    expect(result.reply).toBeNull();
  });
});

describe("transition — AJUDA a partir de qualquer estado", () => {
  it("sai de 'processing' direto para 'idle'", () => {
    const result = transition("processing", { type: "TEXT_RECEIVED", body: "AJUDA" });
    expect(result.next).toBe("idle");
    expect(result.reply).not.toBeNull();
  });

  it("sai de 'under_review' direto para 'idle'", () => {
    const result = transition("under_review", { type: "TEXT_RECEIVED", body: "AJUDA" });
    expect(result.next).toBe("idle");
    expect(result.reply).not.toBeNull();
  });
});
