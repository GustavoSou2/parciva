/**
 * Reenvio duplicado (spec §9.2/C-04, débito documentado da Fase 3) —
 * testa o CONTRATO de dedupe na camada de aplicação: a segunda chamada
 * com o mesmo `MessageSid` nunca chega a enfileirar de novo. Não
 * precisa de Postgres — a mecânica de lock/`ON CONFLICT` de
 * `claimInboundMessage` já é responsabilidade de `infra/inbound-
 * repository.ts`, fora do escopo de um teste de domínio/aplicação.
 */

import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { TenantContext } from "@/db/client";
import { isErr } from "@/shared/result";
import { handleInbound, type HandleInboundDeps } from "./handle-inbound";
import type { ParsedInbound, TwilioInboundMessage } from "../domain/types";

const AUTH_TOKEN = "test-auth-token";
const URL = "https://parciva.example.com/api/webhooks/whatsapp";

function buildSignature(url: string, params: Record<string, string>): string {
  const baseString = Object.keys(params)
    .sort()
    .reduce((acc, key) => `${acc}${key}${params[key] ?? ""}`, url);
  return createHmac("sha1", AUTH_TOKEN).update(baseString, "utf-8").digest("base64");
}

const RAW_PARAMS: Record<string, string> = {
  From: "whatsapp:+5511999990000",
  To: "whatsapp:+5511888880000",
  MessageSid: "SM_DUPLICATE_TEST",
  NumMedia: "1",
  MediaUrl0: "https://api.twilio.com/media/abc",
  MediaContentType0: "image/jpeg",
};

const PAYLOAD: TwilioInboundMessage = {
  From: RAW_PARAMS.From!,
  To: RAW_PARAMS.To!,
  MessageSid: RAW_PARAMS.MessageSid!,
  NumMedia: RAW_PARAMS.NumMedia!,
  MediaUrl0: RAW_PARAMS.MediaUrl0!,
  MediaContentType0: RAW_PARAMS.MediaContentType0!,
};

const CTX: TenantContext = { tenantId: "tenant-1" };

interface Spies {
  readonly checkDuplicate: ReturnType<typeof vi.fn<(inbound: ParsedInbound) => Promise<boolean>>>;
  readonly downloadMedia: ReturnType<typeof vi.fn>;
  readonly enqueueReceipt: ReturnType<typeof vi.fn>;
  readonly sendReply: ReturnType<typeof vi.fn>;
}

function buildDeps(spies: Partial<Spies> = {}): { deps: HandleInboundDeps; spies: Spies } {
  const allSpies: Spies = {
    checkDuplicate: vi.fn<(inbound: ParsedInbound) => Promise<boolean>>(),
    downloadMedia: vi.fn().mockResolvedValue(Buffer.from("fake-image-bytes")),
    enqueueReceipt: vi.fn().mockResolvedValue(undefined),
    sendReply: vi.fn().mockResolvedValue(undefined),
    ...spies,
  };
  return {
    deps: { getAuthToken: () => AUTH_TOKEN, ...allSpies },
    spies: allSpies,
  };
}

describe("handleInbound — reenvio duplicado nunca enfileira de novo", () => {
  it("primeira chamada processa; segunda chamada com o mesmo MessageSid é rejeitada sem novo enqueue", async () => {
    let calls = 0;
    const checkDuplicate = vi.fn<(inbound: ParsedInbound) => Promise<boolean>>().mockImplementation(() => {
      calls += 1;
      return Promise.resolve(calls > 1);
    });
    const { deps, spies } = buildDeps({ checkDuplicate });
    const signature = buildSignature(URL, RAW_PARAMS);

    const first = await handleInbound(CTX, PAYLOAD, RAW_PARAMS, signature, URL, deps);
    expect(isErr(first)).toBe(false);
    expect(spies.enqueueReceipt).toHaveBeenCalledTimes(1);

    const second = await handleInbound(CTX, PAYLOAD, RAW_PARAMS, signature, URL, deps);
    expect(second).toEqual({ ok: false, error: "duplicate" });
    expect(spies.enqueueReceipt).toHaveBeenCalledTimes(1); // ainda 1 — não enfileirou de novo
    expect(spies.downloadMedia).toHaveBeenCalledTimes(1); // não tentou baixar mídia de novo
  });

  it("assinatura inválida nunca chega a checar duplicata", async () => {
    const { deps, spies } = buildDeps();
    const result = await handleInbound(CTX, PAYLOAD, RAW_PARAMS, "assinatura-forjada", URL, deps);
    expect(result).toEqual({ ok: false, error: "invalid_signature" });
    expect(spies.checkDuplicate).not.toHaveBeenCalled();
    expect(spies.enqueueReceipt).not.toHaveBeenCalled();
  });
});
