import { describe, expect, it } from "vitest";
import { PermissionPolicy, defaultPermissionConfig } from "../src/runtime/permissions.js";

describe("permissions extended", () => {
  describe("default permission config", () => {
    it("has rules for all new tools", () => {
      const ruleNames = defaultPermissionConfig.rules.map(r => r.tool);
      expect(ruleNames).toContain("mkdir");
      expect(ruleNames).toContain("move_file");
      expect(ruleNames).toContain("delete_file");
      expect(ruleNames).toContain("stat_file");
      expect(ruleNames).toContain("apply_patch");
      expect(ruleNames).toContain("git_status");
      expect(ruleNames).toContain("git_diff");
      expect(ruleNames).toContain("git_log");
    });

    it("read-only tools are allowed", () => {
      const policy = new PermissionPolicy();
      expect(policy.decide("stat_file")).toBe("allow");
      expect(policy.decide("git_status")).toBe("allow");
      expect(policy.decide("git_diff")).toBe("allow");
      expect(policy.decide("git_log")).toBe("allow");
    });

    it("mutating tools require ask", () => {
      const policy = new PermissionPolicy();
      expect(policy.decide("mkdir")).toBe("ask");
      expect(policy.decide("move_file")).toBe("ask");
      expect(policy.decide("delete_file")).toBe("ask");
      expect(policy.decide("apply_patch")).toBe("ask");
    });

    it("existing tools keep their permissions", () => {
      const policy = new PermissionPolicy();
      expect(policy.decide("read_file")).toBe("allow");
      expect(policy.decide("list_files")).toBe("allow");
      expect(policy.decide("grep")).toBe("allow");
      expect(policy.decide("glob")).toBe("allow");
      expect(policy.decide("write_file")).toBe("ask");
      expect(policy.decide("edit_file")).toBe("ask");
      expect(policy.decide("bash")).toBe("ask");
    });
  });

  describe("wildcard rules", () => {
    it("uses wildcard default when tool has no explicit rule", () => {
      const policy = new PermissionPolicy({
        rules: [{ tool: "*", decision: "deny" }],
        defaultDecision: "deny",
      });
      expect(policy.decide("read_file")).toBe("deny");
    });

    it("explicit rule overrides wildcard", () => {
      const policy = new PermissionPolicy({
        rules: [
          { tool: "*", decision: "deny" },
          { tool: "read_file", decision: "allow" },
        ],
        defaultDecision: "deny",
      });
      expect(policy.decide("read_file")).toBe("allow");
      expect(policy.decide("write_file")).toBe("deny");
    });
  });

  describe("default decision", () => {
    it("falls back to defaultDecision for unknown tools", () => {
      const policy = new PermissionPolicy({
        rules: [],
        defaultDecision: "deny",
      });
      expect(policy.decide("unknown_tool")).toBe("deny");
    });

    it("falls back to allow when defaultDecision is allow", () => {
      const policy = new PermissionPolicy({
        rules: [],
        defaultDecision: "allow",
      });
      expect(policy.decide("unknown_tool")).toBe("allow");
    });
  });
});
