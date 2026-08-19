import { describe, expect, it } from "vitest";
import { isErr } from "@/shared/result";
import { isOperational, isReadOnly, transition } from "./lifecycle";
import type { TransitionEvent } from "./types";

const ALL_EVENTS: TransitionEvent[] = [
  "payment_confirmed",
  "payment_failed",
  "payment_overdue",
  "admin_suspend",
  "admin_reactivate",
  "cancel_requested",
  "purge_scheduled",
];

describe("transition", () => {
  it("trial + payment_confirmed → active", () => {
    const result = transition("trial", "payment_confirmed");
    expect(result).toEqual({ ok: true, value: "active" });
  });

  it("active + payment_failed → past_due", () => {
    const result = transition("active", "payment_failed");
    expect(result).toEqual({ ok: true, value: "past_due" });
  });

  it("past_due + payment_confirmed → active", () => {
    const result = transition("past_due", "payment_confirmed");
    expect(result).toEqual({ ok: true, value: "active" });
  });

  it("past_due + payment_overdue → suspended (dunning automático)", () => {
    const result = transition("past_due", "payment_overdue");
    expect(result).toEqual({ ok: true, value: "suspended" });
  });

  it("suspended + admin_reactivate → active", () => {
    const result = transition("suspended", "admin_reactivate");
    expect(result).toEqual({ ok: true, value: "active" });
  });

  it("cancelled + purge_scheduled → purged", () => {
    const result = transition("cancelled", "purge_scheduled");
    expect(result).toEqual({ ok: true, value: "purged" });
  });

  it("purged + qualquer evento → Err invalid_transition", () => {
    for (const event of ALL_EVENTS) {
      const result = transition("purged", event);
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error).toBe("invalid_transition");
      }
    }
  });
});

describe("isOperational", () => {
  it("trial e active são operacionais", () => {
    expect(isOperational("trial")).toBe(true);
    expect(isOperational("active")).toBe(true);
  });

  it("suspended não é operacional", () => {
    expect(isOperational("suspended")).toBe(false);
  });
});

describe("isReadOnly", () => {
  it("suspended é somente leitura", () => {
    expect(isReadOnly("suspended")).toBe(true);
  });

  it("active não é somente leitura", () => {
    expect(isReadOnly("active")).toBe(false);
  });
});
