export type PermissionDecision = "allow" | "deny" | "ask";

export interface PermissionRule {
  tool: string;
  decision: PermissionDecision;
}

export interface PermissionConfig {
  rules: PermissionRule[];
  defaultDecision: PermissionDecision;
}

export const defaultPermissionConfig: PermissionConfig = {
  rules: [
    { tool: "read_file", decision: "allow" },
    { tool: "list_files", decision: "allow" },
    { tool: "grep", decision: "allow" },
    { tool: "write_file", decision: "ask" },
    { tool: "edit_file", decision: "ask" },
    { tool: "bash", decision: "ask" },
  ],
  defaultDecision: "deny",
};

export class PermissionPolicy {
  constructor(private readonly config: PermissionConfig = defaultPermissionConfig) {}

  decide(toolName: string): PermissionDecision {
    const explicit = this.config.rules.find((rule) => rule.tool === toolName);
    if (explicit) {
      return explicit.decision;
    }

    const wildcard = this.config.rules.find((rule) => rule.tool === "*");
    if (wildcard) {
      return wildcard.decision;
    }

    return this.config.defaultDecision;
  }
}
