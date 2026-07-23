import { describe, expect, it } from "vitest";
import { PermissionPolicy } from "../src/runtime/permissions.js";
import type { InteractionMode } from "../src/runtime/mode.js";

/**
 * Tests the conceptual interaction between mode and permission policy.
 * The actual mode enforcement happens in TuiView's permissionDecider callback.
 * These tests verify the policy layer that modes build on.
 */
describe("mode + permission interaction", () => {
  const policy = new PermissionPolicy();

  it("auto mode bypasses all permission checks (handled in UI layer)", () => {
    // In auto mode, the permissionDecider resolves "allow" immediately
    // regardless of what the policy says. The policy is still consulted
    // but the mode overrides the result.
    const decision = policy.decide("write_file");
    expect(decision).toBe("ask"); // policy says ask
    // In auto mode, the UI layer would override this to "allow"
  });

  it("approve mode forces all tools to ask (handled in UI layer)", () => {
    // In approve mode, the permissionDecider always shows the prompt
    // regardless of what the policy says.
    const readDecision = policy.decide("read_file");
    expect(readDecision).toBe("allow"); // policy says allow
    // In approve mode, the UI layer would override this to show a prompt
  });

  it("plan mode uses policy defaults but shows plan on first tool call", () => {
    // In plan mode, the first tool call triggers a plan prompt.
    // If approved, subsequent calls auto-allow.
    const decision = policy.decide("bash");
    expect(decision).toBe("ask"); // policy says ask
    // In plan mode, the UI layer would show this as part of the plan
  });

  it("permission policy has correct defaults for all new tools", () => {
    // Verify the policy layer is correct regardless of mode
    expect(policy.decide("read_file")).toBe("allow");
    expect(policy.decide("write_file")).toBe("ask");
    expect(policy.decide("bash")).toBe("ask");
    expect(policy.decide("delete_file")).toBe("ask");
    expect(policy.decide("mkdir")).toBe("ask");
    expect(policy.decide("git_status")).toBe("allow");
  });
});
