import { describe, expect, it } from "vitest";
import {
  defaultPermissionConfig,
  PermissionPolicy,
} from "../src/runtime/permissions.js";

describe("permission policy", () => {
  it("allows read-only tools and asks for mutating defaults", () => {
    const policy = new PermissionPolicy(defaultPermissionConfig);

    expect(policy.decide("read_file")).toBe("allow");
    expect(policy.decide("list_files")).toBe("allow");
    expect(policy.decide("grep")).toBe("allow");
    expect(policy.decide("write_file")).toBe("ask");
    expect(policy.decide("edit_file")).toBe("ask");
    expect(policy.decide("bash")).toBe("ask");
  });

  it("uses explicit rules before wildcard rules", () => {
    const policy = new PermissionPolicy({
      rules: [
        { tool: "*", decision: "deny" },
        { tool: "read_file", decision: "allow" },
      ],
      defaultDecision: "ask",
    });

    expect(policy.decide("read_file")).toBe("allow");
    expect(policy.decide("grep")).toBe("deny");
  });

  it("falls back to the default decision when no rule matches", () => {
    const policy = new PermissionPolicy({
      rules: [],
      defaultDecision: "deny",
    });

    expect(policy.decide("custom_tool")).toBe("deny");
  });
});
