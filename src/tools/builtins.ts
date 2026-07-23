import { BashTool } from "./bash.js";
import { EditFileTool } from "./edit.js";
import { GrepTool } from "./grep.js";
import { ListFilesTool } from "./list-files.js";
import { ReadFileTool } from "./read.js";
import { WriteFileTool } from "./write.js";
import { MkdirTool } from "./mkdir.js";
import { MoveFileTool } from "./move.js";
import { DeleteFileTool } from "./delete.js";
import { StatFileTool } from "./stat.js";
import { ApplyPatchTool } from "./apply-patch.js";
import { GitStatusTool, GitDiffTool, GitLogTool } from "./git.js";
import { ToolRegistry } from "./registry.js";

export function createDefaultToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register(new ReadFileTool());
  registry.register(new ListFilesTool());
  registry.register(new GrepTool());
  registry.register(new WriteFileTool());
  registry.register(new EditFileTool());
  registry.register(new BashTool());
  registry.register(new MkdirTool());
  registry.register(new MoveFileTool());
  registry.register(new DeleteFileTool());
  registry.register(new StatFileTool());
  registry.register(new ApplyPatchTool());
  registry.register(new GitStatusTool());
  registry.register(new GitDiffTool());
  registry.register(new GitLogTool());
  return registry;
}
