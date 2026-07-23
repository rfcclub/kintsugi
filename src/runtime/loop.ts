import type { RuntimeEvent } from "../protocol/events.js";
import type { RuntimeMessage } from "../protocol/messages.js";
import type { Provider, ProviderMessage, ProviderTurnRequest, ToolCall, ToolResult } from "../providers/provider.js";
import type { PermissionDecision } from "./permissions.js";
import { assemblePrompt, type PromptConfig } from "./prompt.js";
import type { KintsugiRuntime } from "./session.js";
import { getToolMessageFormatter } from "../providers/registry.js";
import { resolveHook, runHookProcess } from "./hooks.js";
import { globalRateLimiter } from "./rate-limiter.js";

export async function* runTurn(
  runtime: KintsugiRuntime,
  provider: Provider,
  userText: string,
  promptConfig?: PromptConfig,
  options: RunTurnOptions = {}
): AsyncIterable<RuntimeEvent> {
  const trimmed = userText.trim();
  if (!trimmed) {
    const message = "No prompt received.";
    yield { type: "turn.failed", message };
    runtime.prompts.push(runtimeMessage("runtime", message));
    return;
  }

  // --- Initial prompt assembly ---
  const prompt = assemblePrompt(runtime, trimmed, promptConfig ?? runtime.promptConfig);
  runtime.messageCount = (runtime.messageCount ?? 0) + 1;
  const userMessage = runtimeMessage("user", trimmed);
  runtime.prompts.push(userMessage);
  const turnIndex = runtime.prompts.filter((m) => m.role === "user").length;
  if (runtime.sessionWriter) {
    runtime.sessionWriter.currentTurn = turnIndex;
  }
  runtime.sessionWriter?.message(userMessage);

  // --- First turn ---
  let baseMessages: ProviderMessage[] = prompt.messages;
  const toolSpecs = runtime.toolRegistry?.allSpecs();

  try {
    yield* runTurnLoop(runtime, provider, baseMessages, toolSpecs, options);
  } finally {
    if (runtime.workspace) {
      const workspace = runtime.workspace;
      try {
        const { isGitActive, createGitSnapshot } = await import("./git-rollback.js");
        const { updateGitHashInSessionLog } = await import("../store/sessions.js");
        if (isGitActive(workspace)) {
          const hash = createGitSnapshot(turnIndex, workspace);
          if (hash && runtime.sessionWriter) {
            runtime.sessionWriter.currentGitHash = hash;
            updateGitHashInSessionLog(runtime.sessionWriter.filePath, turnIndex, hash);
          }
        }
      } catch (err) {
        console.error("Git snapshot error:", err);
      }
    }
  }
}

/**
 * Inner turn loop that handles tool-loop continuation.
 * After a provider processes tool results, this loops back to
 * send the results to the provider for further processing.
 *
 * Max continuation depth prevents infinite loops from misbehaving providers.
 */
const MAX_TOOL_CONTINUATION_DEPTH = 20;

async function* runTurnLoop(
  runtime: KintsugiRuntime,
  provider: Provider,
  messages: ProviderMessage[],
  toolSpecs?: ProviderTurnRequest["tools"],
  options: RunTurnOptions = {}
): AsyncIterable<RuntimeEvent> {
  let continuationDepth = 0;
  const seenToolCallIds = new Set<string>();
  let cancelled = false;

  const cancelEvent = (): Extract<RuntimeEvent, { type: "turn.cancelled" }> => ({
    type: "turn.cancelled",
    reason: resolveCancelReason(options.cancelReason),
  });

  function isAborted(): boolean {
    return options.signal?.aborted === true;
  }

  while (continuationDepth < MAX_TOOL_CONTINUATION_DEPTH) {
    if (isAborted()) {
      const event = cancelEvent();
      yield event;
      runtime.sessionWriter?.event(event);
      return;
    }

    continuationDepth++;

    const request: ProviderTurnRequest = {
      messages,
      tools: toolSpecs,
      modelConfig: runtime.modelConfig,
      signal: options.signal,
    };

    let deltaText = "";
    let completedText: string | undefined;
    const roundToolCalls: ToolCall[] = [];
    const roundToolResults: ToolResult[] = [];
    let hadFailure = false;

    // Rate limit per provider (sliding window)
    const providerId = runtime.providerPreset ?? "default";
    const rateLimitConfig = runtime.config?.providers?.[providerId]?.rateLimit;
    await globalRateLimiter.acquire(providerId, rateLimitConfig);

    for await (const event of provider.streamTurn(request)) {
      if (isAborted()) {
        cancelled = true;
        break;
      }

      yield event;
      runtime.sessionWriter?.event(event);

      if (event.type === "assistant.delta") {
        deltaText += event.text;
      }

      if (event.type === "thinking.delta") {
        runtime.sessionWriter?.thinking(event.text);
      }

      if (event.type === "turn.completed" && event.usage) {
        runtime.totalTokens = (runtime.totalTokens ?? 0) + event.usage.total;
      }

      if (event.type === "tool.requested") {
        const call: ToolCall = {
          id: event.id,
          name: event.name,
          args: event.args,
        };
        roundToolCalls.push(call);

        const resultEvent = await executeToolRequest(runtime, event, options.signal);
        if (isAborted()) {
          cancelled = true;
          break;
        }
        yield resultEvent;
        runtime.sessionWriter?.event(resultEvent);

        const isError =
          resultEvent.output.startsWith("Error:") ||
          resultEvent.output.startsWith("Permission denied") ||
          resultEvent.output.startsWith("Unknown tool:");

        const result: ToolResult = {
          id: resultEvent.id,
          name: event.name,
          output: resultEvent.output,
          isError,
        };
        roundToolResults.push(result);

        runtime.sessionWriter?.toolResult({
          toolCallId: resultEvent.id,
          output: resultEvent.output,
          isError,
        });
      }

      if (event.type === "assistant.completed") {
        completedText = event.text;
      }

      if (event.type === "turn.failed") {
        const failureMessage = runtimeMessage("runtime", event.message);
        runtime.prompts.push(failureMessage);
        runtime.messageCount = (runtime.messageCount ?? 0) + 1;
        runtime.sessionWriter?.message(failureMessage);
        hadFailure = true;
        break;
      }
    }

    if (cancelled || isAborted()) {
      const event = cancelEvent();
      yield event;
      runtime.sessionWriter?.event(event);
      return;
    }

    // If the turn failed, stop
    if (hadFailure) {
      return;
    }

    const fullText = completedText ?? deltaText;

    // --- Tool-loop continuation check ---
    if (roundToolCalls.length === 0) {
      // No tool calls — this is the final response
      const assistantMessage = runtimeMessage("assistant", fullText);
      runtime.prompts.push(assistantMessage);
      runtime.messageCount = (runtime.messageCount ?? 0) + 1;
      runtime.sessionWriter?.message(assistantMessage);
      return;
    }

    // Check for repeated tool calls (safety guard against infinite loops)
    const allAlreadySeen = roundToolCalls.every((c) => seenToolCallIds.has(c.id));
    if (allAlreadySeen) {
      // Provider returned the same tool calls again — it didn't process results.
      // Record what we have and stop.
      const combinedText = fullText || "Tool execution completed.";
      const assistantMessage = runtimeMessage("assistant", combinedText);
      runtime.prompts.push(assistantMessage);
      runtime.messageCount = (runtime.messageCount ?? 0) + 1;
      runtime.sessionWriter?.message(assistantMessage);
      return;
    }

    // Track newly seen tool call IDs
    for (const c of roundToolCalls) {
      seenToolCallIds.add(c.id);
    }

    // Tool calls were made — build continuation messages
    if (isAborted()) {
      const event = cancelEvent();
      yield event;
      runtime.sessionWriter?.event(event);
      return;
    }

    const formatter = getToolMessageFormatter(provider.id);
    const toolMessages = formatter(roundToolCalls, roundToolResults, fullText);

    // Append assistant + tool result messages for the next turn
    messages = [...messages, ...toolMessages];
  }

  // Max depth reached — emit warning and finalize
  const warning = "Tool continuation depth limit reached. Some tool results may not have been processed.";
  const assistantMessage = runtimeMessage("assistant", warning);
  runtime.prompts.push(assistantMessage);
  runtime.messageCount = (runtime.messageCount ?? 0) + 1;
  runtime.sessionWriter?.message(assistantMessage);
}

export interface RunTurnOptions {
  signal?: AbortSignal;
  cancelReason?:
    | Extract<RuntimeEvent, { type: "turn.cancelled" }>["reason"]
    | (() => Extract<RuntimeEvent, { type: "turn.cancelled" }>["reason"]);
}

function resolveCancelReason(reason: RunTurnOptions["cancelReason"]): Extract<RuntimeEvent, { type: "turn.cancelled" }>["reason"] {
  return typeof reason === "function" ? reason() : reason ?? "abort";
}

async function executeToolRequest(
  runtime: KintsugiRuntime,
  event: Extract<RuntimeEvent, { type: "tool.requested" }>,
  signal?: AbortSignal
): Promise<Extract<RuntimeEvent, { type: "tool.completed" }>> {
  if (runtime.allowedTools && !runtime.allowedTools.includes(event.name)) {
    return { type: "tool.completed", id: event.id, output: "Permission denied" };
  }

  const tool = runtime.toolRegistry?.lookup(event.name);
  if (!tool) {
    return { type: "tool.completed", id: event.id, output: `Unknown tool: ${event.name}` };
  }

  let toolArgs = event.args;

  // === 1. PRE-TOOL LIFECYCLE HOOKS ===
  const preHook = await resolveHook(runtime, "pre", event.name);
  if (preHook) {
    const preResult = await runHookProcess(preHook, {
      event: "pre",
      tool: event.name,
      id: event.id,
      arguments: toolArgs as Record<string, any>,
      context: {
        workspace: runtime.workspace ?? process.cwd(),
        model: runtime.model ?? "unknown",
        messageCount: runtime.messageCount ?? 0,
      }
    }, signal);

    if (preResult.status === "deny") {
      return {
        type: "tool.completed",
        id: event.id,
        output: `Hook Aborted: ${preResult.error ?? "Rejected by PreToolUse hook."}`
      };
    }
    if (preResult.args) {
      toolArgs = preResult.args;
    }
  }

  let decision = runtime.sessionPermissions?.[event.name] ??
    runtime.permissionPolicy?.decide(event.name) ??
    "ask";

  if (decision === "ask") {
    decision = runtime.permissionDecider
      ? await runtime.permissionDecider(event.name, toolArgs, signal)
      : "deny";
  }

  if (signal?.aborted) {
    return { type: "tool.completed", id: event.id, output: "Permission denied" };
  }

  runtime.sessionWriter?.toolCall({
    toolCallId: event.id,
    toolName: event.name,
    args: toolArgs,
    decision,
  });

  if (decision === "deny") {
    return { type: "tool.completed", id: event.id, output: "Permission denied" };
  }

  const args = normalizeToolArgs(toolArgs, event.id);
  let result = await tool.execute(args, {
    workingDir: process.cwd(),
    workspaceRoots: runtime.workspaceRoots?.length ? runtime.workspaceRoots : [process.cwd()],
    permission: decision as PermissionDecision,
    signal,
    runtime,
  });

  let output = result.output;
  let isError = result.isError;

  // === 2. POST-TOOL LIFECYCLE HOOKS ===
  const postHook = await resolveHook(runtime, "post", event.name);
  if (postHook) {
    const postResult = await runHookProcess(postHook, {
      event: "post",
      tool: event.name,
      id: event.id,
      arguments: toolArgs as Record<string, any>,
      context: {
        workspace: runtime.workspace ?? process.cwd(),
        model: runtime.model ?? "unknown",
        messageCount: runtime.messageCount ?? 0,
      },
      output,
      isError,
    }, signal);

    if (postResult.status === "deny") {
      isError = true;
      output = `Hook Verification Failed: ${postResult.error ?? "Rejected by PostToolUse hook."}`;
    } else if (postResult.output !== undefined) {
      output = postResult.output;
    }
  }

  return {
    type: "tool.completed",
    id: event.id,
    output: isError ? `Error: ${output}` : output,
  };
}

function normalizeToolArgs(args: unknown, toolCallId: string): Record<string, unknown> {
  return {
    ...(args && typeof args === "object" && !Array.isArray(args) ? args : { value: args }),
    toolCallId,
  };
}

function runtimeMessage(
  role: RuntimeMessage["role"],
  text: string
): RuntimeMessage {
  return { role, text, at: new Date().toISOString() };
}
