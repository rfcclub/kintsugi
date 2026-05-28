import type { Tool, ToolSpec } from "./tool.js";

export class ToolRegistry {
  private readonly tools = new Map<string, Tool>();

  register(tool: Tool): void {
    this.tools.set(tool.spec.name, tool);
  }

  lookup(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  allSpecs(): ToolSpec[] {
    return [...this.tools.values()].map((tool) => tool.spec);
  }

  canSatisfy(toolCalls: Array<{ name: string }>): {
    satisfied: string[];
    missing: string[];
  } {
    const satisfied: string[] = [];
    const missing: string[] = [];

    for (const call of toolCalls) {
      (this.tools.has(call.name) ? satisfied : missing).push(call.name);
    }

    return { satisfied, missing };
  }
}
