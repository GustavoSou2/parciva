import { describe, expect, it } from "vitest";
import { isErr } from "@/shared/result";
import { canAutoApprove, hasPermission, requirePermission } from "./authorization";
import { ROLE_PERMISSIONS } from "./types";
import type { Permission } from "./types";

const ALL_PERMISSIONS: Permission[] = [
  "contracts:read",
  "contracts:write",
  "payments:read",
  "payments:write",
  "receipts:read",
  "receipts:approve",
  "members:read",
  "members:write",
  "settings:read",
  "settings:write",
  "billing:read",
  "billing:write",
];

describe("hasPermission", () => {
  it("owner tem todas as permissões", () => {
    for (const permission of ALL_PERMISSIONS) {
      expect(hasPermission("owner", permission)).toBe(true);
    }
  });

  it("viewer não tem payments:write", () => {
    expect(hasPermission("viewer", "payments:write")).toBe(false);
  });

  it("operator tem receipts:approve", () => {
    expect(hasPermission("operator", "receipts:approve")).toBe(true);
  });

  it("admin tem todas as permissões exceto billing:write", () => {
    expect(ROLE_PERMISSIONS.admin.has("billing:write")).toBe(false);
    for (const permission of ALL_PERMISSIONS.filter((p) => p !== "billing:write")) {
      expect(hasPermission("admin", permission)).toBe(true);
    }
  });
});

describe("requirePermission", () => {
  it("retorna Err para papel sem permissão", () => {
    const result = requirePermission("viewer", "payments:write");
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error).toBe("unauthorized");
    }
  });

  it("retorna Ok para papel com permissão", () => {
    const result = requirePermission("operator", "receipts:approve");
    expect(result.ok).toBe(true);
  });
});

describe("canAutoApprove", () => {
  it("retorna false para operator e viewer", () => {
    expect(canAutoApprove("operator")).toBe(false);
    expect(canAutoApprove("viewer")).toBe(false);
  });

  it("retorna true para admin e owner", () => {
    expect(canAutoApprove("admin")).toBe(true);
    expect(canAutoApprove("owner")).toBe(true);
  });
});
