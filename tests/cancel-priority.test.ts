import { describe, expect, it } from "vitest";
import { determineCancelAction } from "../src/ui/commands/cancel-priority.js";

describe("Esc cancel priority", () => {
  it("denies pending permission before closing overlays or stopping turns", () => {
    expect(determineCancelAction({
      hasPendingPermission: true,
      hasOverlay: true,
      isStreaming: true,
      hasDraft: true,
    })).toBe("deny-permission");
  });

  it("closes overlays before stopping running work", () => {
    expect(determineCancelAction({
      hasPendingPermission: false,
      hasOverlay: true,
      isStreaming: true,
      hasDraft: true,
    })).toBe("close-overlay");
  });

  it("stops a running turn before clearing composer drafts", () => {
    expect(determineCancelAction({
      hasPendingPermission: false,
      hasOverlay: false,
      isStreaming: true,
      hasDraft: true,
    })).toBe("stop-turn");
  });

  it("clears drafts before reporting idle", () => {
    expect(determineCancelAction({
      hasPendingPermission: false,
      hasOverlay: false,
      isStreaming: false,
      hasDraft: true,
    })).toBe("clear-draft");
  });

  it("reports idle when nothing is cancellable", () => {
    expect(determineCancelAction({
      hasPendingPermission: false,
      hasOverlay: false,
      isStreaming: false,
      hasDraft: false,
    })).toBe("idle");
  });
});
