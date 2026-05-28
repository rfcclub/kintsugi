import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseArgs } from "../src/cli/args.js";
import { resolveConfig } from "../src/config/config.js";
import { runConfigDoctor } from "../src/config/doctor.js";
import { LearnedStore } from "../src/memory/learned-store.js";
import { OpsLog } from "../src/memory/ops-store.js";
import { reconstruct } from "../src/memory/reconstruct.js";
import type { Provider, ProviderTurnRequest } from "../src/providers/provider.js";
import { PermissionPolicy } from "../src/runtime/permissions.js";
import { runTurn } from "../src/runtime/loop.js";
import { bootRuntime } from "../src/runtime/runtime.js";
import { readSessionLog } from "../src/store/replay.js";
import { SessionWriter } from "../src/store/sessions.js";
import { formatModelInspect, resolveModelSelection } from "../src/ui/commands/model-actions.js";

describe("spec good flow", () => {
  it("runs preset config, doctor, memory prompt, tool continuation, and session replay together", async () => {
    const root = mkdtempSync(join(tmpdir(), "kintsugi-spec-good-flow-"));
    const keyFile = join(root, "example.key");
    const configFile = join(root, "config.yaml");
    const sessionRoot = join(root, "sessions");
    const memoryDir = join(root, "memory");
    writeFileSync(keyFile, "sk-good-flow-secret\n", "utf-8");
    writeFileSync(configFile, `
modelProfile: example-greg
workspaceRoots:
  - ${process.cwd()}
modelProfiles:
  example-greg:
    preset: example
    model: greg
    settings:
      keyFile: ${keyFile}
    capabilities:
      tools: true
    config:
      maxTokens: 128
`, "utf-8");
    mkdirSync(sessionRoot);

    const config = resolveConfig(parseArgs(["ask", "--model-profile", "example-greg", "read src/cli/args.ts"]), {
      homeConfigPath: configFile,
      repoConfigPath: join(root, "missing.yaml"),
      env: {},
    });
    const selection = resolveModelSelection(config, { modelProfile: "example-greg" });
    const inspect = formatModelInspect(selection);
    const doctorIssues = runConfigDoctor(config).filter((issue) => issue.severity === "error");

    expect(config.provider).toBe("openai-chat");
    expect(config.providerPreset).toBe("example");
    expect(config.model).toBe("greg");
    expect(config.providerSettings.baseUrl).toBe("https://api.example.com/v1");
    expect(doctorIssues).toEqual([]);
    expect(inspect).toContain("preset: example");
    expect(inspect).toContain("provider: openai-chat");
    expect(inspect).toContain(`key: keyFile:${keyFile}`);
    expect(inspect).not.toContain("sk-good-flow-secret");

    const ops = new OpsLog(memoryDir);
    ops.log({
      kind: "learn",
      actor: "external",
      payload: { key: "project.codename", value: "kintsugi-good-flow" },
    });
    const memory = {
      ops,
      learned: new LearnedStore({ memoryDir }),
      reconstruct() {
        return reconstruct(this);
      },
    };
    const writer = new SessionWriter({ root: sessionRoot });
    const runtime = bootRuntime({
      noSubstrate: true,
      provider: config.provider,
      model: config.model,
      modelProfile: config.modelProfile,
      providerPreset: config.providerPreset,
      modelConfig: config.modelConfig,
      workspaceRoots: config.workspaceRoots,
      permissionPolicy: new PermissionPolicy(config.permissions),
      sessionWriter: writer,
      memory,
      opsLog: ops,
    });
    writer.start({ provider: config.provider, model: config.model });

    const provider = new GoodFlowProvider();
    const events = await collect(runTurn(runtime, provider, "Please read src/cli/args.ts"));
    writer.end({ reason: "test", messageCount: runtime.messageCount, totalTokens: runtime.totalTokens });
    writer.close();

    expect(provider.firstRequestHadMemory).toBe(true);
    expect(provider.firstRequestHadReadTool).toBe(true);
    expect(events).toContainEqual({ type: "tool.completed", id: "call-read-args", output: expect.stringContaining("ProviderType") });
    expect(events).toContainEqual({ type: "assistant.completed", text: "GOOD_FLOW_OK" });
    expect(runtime.prompts.map((message) => message.role)).toEqual(["user", "assistant"]);
    expect(runtime.totalTokens).toBe(7);

    const replay = readSessionLog({ filePath: writer.filePath });
    expect(replay.warnings).toBe(0);
    expect(replay.lines.some((line) => line.type === "tool.call" && line.toolName === "read_file")).toBe(true);
    expect(replay.lines.some((line) => line.type === "tool.result" && line.output.includes("ProviderType"))).toBe(true);
    expect(replay.lines.some((line) => line.type === "message" && line.role === "assistant" && line.text === "GOOD_FLOW_OK")).toBe(true);
  });
});

class GoodFlowProvider implements Provider {
  readonly id = "openai-chat";
  firstRequestHadMemory = false;
  firstRequestHadReadTool = false;
  private calls = 0;

  async *streamTurn(request: ProviderTurnRequest) {
    this.calls += 1;
    if (this.calls === 1) {
      this.firstRequestHadMemory = request.messages.some((message) =>
        message.role === "system" && message.content.includes("project.codename: kintsugi-good-flow")
      );
      this.firstRequestHadReadTool = Boolean(request.tools?.some((tool) => tool.name === "read_file"));
      yield { type: "turn.started" as const, id: "good-flow-1" };
      yield {
        type: "tool.requested" as const,
        id: "call-read-args",
        name: "read_file",
        args: { path: "src/cli/args.ts", limit: 12 },
      };
      return;
    }

    expect(request.messages.at(-1)).toMatchObject({
      role: "tool",
      toolCallId: "call-read-args",
    });
    yield { type: "turn.started" as const, id: "good-flow-2" };
    yield { type: "assistant.delta" as const, text: "GOOD_FLOW_OK" };
    yield { type: "assistant.completed" as const, text: "GOOD_FLOW_OK" };
    yield { type: "turn.completed" as const, usage: { prompt: 3, completion: 4, total: 7 } };
  }
}

async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of iterable) {
    items.push(item);
  }
  return items;
}
