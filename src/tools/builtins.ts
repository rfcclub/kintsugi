import { BashTool } from "./bash.js";
import { EditFileTool } from "./edit.js";
import { GrepTool } from "./grep.js";
import { ListFilesTool } from "./list-files.js";
import { ReadFileTool } from "./read.js";
import { ToolRegistry } from "./registry.js";
import { WriteFileTool } from "./write.js";

export function createDefaultToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register(new ReadFileTool());
  registry.register(new ListFilesTool());
  registry.register(new GrepTool());
  registry.register(new WriteFileTool());
  registry.register(new EditFileTool());
  registry.register(new BashTool());
  return registry;
}
