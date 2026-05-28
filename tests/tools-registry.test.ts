import { describe, expect, it } from "vitest";
import { ToolRegistry } from "../src/tools/registry.js";
import type { Tool } from "../src/tools/tool.js";

function makeTool(name: string): Tool {
  return {
    spec: {
      name,
      description: `${name} description`,
      parameters: {
        type: "object",
        properties: {},
      },
    },
    async execute() {
      return { toolCallId: "", output: "ok", isError: false };
    },
  };
}

describe("tool registry", () => {
  it("registers and looks up tools by name", () => {
    const registry = new ToolRegistry();
    const tool = makeTool("read_file");

    registry.register(tool);

    expect(registry.lookup("read_file")).toBe(tool);
    expect(registry.lookup("missing")).toBeUndefined();
  });

  it("returns all registered specs", () => {
    const registry = new ToolRegistry();
    registry.register(makeTool("read_file"));
    registry.register(makeTool("grep"));

    expect(registry.allSpecs().map((spec) => spec.name)).toEqual([
      "read_file",
      "grep",
    ]);
  });

  it("reports satisfied and missing tool calls", () => {
    const registry = new ToolRegistry();
    registry.register(makeTool("read_file"));

    expect(
      registry.canSatisfy([{ name: "read_file" }, { name: "write_file" }])
    ).toEqual({
      satisfied: ["read_file"],
      missing: ["write_file"],
    });
  });
});
