# Design: Phase 2 — Mock Provider and Streaming

## Provider Interface

```ts
// src/providers/provider.ts

export interface ProviderTurnRequest {
  messages: ProviderMessage[];
  model?: string;
  tools?: ToolSpec[];
}

export interface ProviderMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolCallId?: string;
}

export interface ToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
}

export interface Provider {
  readonly id: string;
  streamTurn(request: ProviderTurnRequest): AsyncIterable<RuntimeEvent>;
}
```

Key constraint: `Provider` receives messages and tools, emits `RuntimeEvent`. It never touches Ink, substrate, or session store.

`ProviderMessage` uses provider-facing roles (`system`, `user`, `assistant`, `tool`). `RuntimeMessage` uses runtime-facing roles (`user`, `assistant`, `runtime`, `tool`). Phase 2 owns an explicit temporary mapping in `buildMessages()`:

- `user` -> `user`
- `assistant` -> `assistant`
- `tool` -> `tool`
- `runtime` -> `system`

Phase 3 replaces this temporary mapper with `assemblePrompt()`, but the role vocabulary boundary must remain explicit.

## Mock Provider

```ts
// src/providers/mock.ts

export interface MockProviderConfig {
  responseText?: string;       // default: "Mock response received."
  delayMs?: number;             // simulated streaming delay (default: 50)
  failAfter?: number;          // emit turn.failed after N turns (default: never)
  toolCall?: {                 // optionally emit a tool request
    name: string;
    args: unknown;
  };
}
```

`MockProvider.streamTurn()` emits this sequence:

1. `{ type: "turn.started", id: <uuid> }`
2. For each chunk of the response text (split into ~10-char deltas with `delayMs` pause):
   `{ type: "assistant.delta", text: <chunk> }`
3. If `toolCall` is configured:
   `{ type: "tool.requested", id: <uuid>, name, args }`
   → then after "tool execution":
   `{ type: "tool.completed", id: <uuid>, output: "mock tool output" }`
4. `{ type: "assistant.completed", text: <full text> }`
5. `{ type: "turn.completed", usage: { prompt: 0, completion: 0, total: 0 } }`

If `failAfter` triggers:
1. `{ type: "turn.started", id: <uuid> }`
2. `{ type: "turn.failed", message: "Mock provider failure" }`

## Turn Loop

```ts
// src/runtime/loop.ts

export async function* runTurn(
  runtime: KintsugiRuntime,
  provider: Provider,
  userText: string,
): AsyncIterable<RuntimeEvent> {
  // 1. Record user message
  const userMsg: ProviderMessage = { role: "user", content: userText };
  runtime.prompts.push({ role: "user", text: userText, at: new Date().toISOString() });

  // 2. Build request (prompt assembly is Phase 3; for now, flat messages)
  const request: ProviderTurnRequest = {
    messages: buildMessages(runtime, userMsg),
  };

  // 3. Stream provider events
  let deltaText = "";
  let completedText: string | undefined;
  for await (const event of provider.streamTurn(request)) {
    yield event;

    if (event.type === "assistant.delta") {
      deltaText += event.text;
    }
    if (event.type === "assistant.completed") {
      completedText = event.text;
    }

    if (event.type === "turn.failed") {
      runtime.prompts.push({ role: "runtime", text: event.message, at: new Date().toISOString() });
      return; // stop on failure
    }

    // Tool handling is Phase 5; for now, tool.requested + tool.completed pass through
  }

  // 4. Record assistant message
  const fullText = completedText ?? deltaText;
  runtime.prompts.push({ role: "assistant", text: fullText, at: new Date().toISOString() });
}

function buildMessages(runtime: KintsugiRuntime, userMsg: ProviderMessage): ProviderMessage[] {
  const messages: ProviderMessage[] = [];

  // System message from Echo (Phase 3 will make this explicit)
  if (runtime.substrate) {
    messages.push({ role: "system", content: runtime.substrate.content });
  }

  // Prior conversation, using explicit RuntimeMessage -> ProviderMessage role mapping.
  for (const p of runtime.prompts) {
    messages.push({ role: mapRuntimeRole(p.role), content: p.text });
  }

  messages.push(userMsg);
  return messages;
}
```

## UI Subscription Pattern

Ink views need to react to streaming events. Since Ink re-renders on state change, the pattern is:

1. `TuiView` calls `runTurn()` and collects events.
2. Each `assistant.delta` appends to a `streamingText` state.
3. `assistant.completed` finalizes the message into the `messages` array.
4. Errors from `turn.failed` render inline.

Phase 2 only proves the streaming path; it is allowed to stay visually minimal. After the boundary works, the TUI should move toward user's preferred colorful style: distinct role colors, streaming cursor, status accents, Echo/session indicators, and a more polished transcript/composer layout.

```tsx
// Simplified TuiView streaming pattern

async function handleSubmit(text: string) {
  setStreaming(true);
  let buffer = "";

  for await (const event of runTurn(runtime, provider, text)) {
    if (event.type === "assistant.delta") {
      buffer += event.text;
      setStreamingText(buffer);  // triggers Ink re-render
    }
    if (event.type === "assistant.completed") {
      setMessages(prev => [...prev, `you: ${text}`, event.text]);
      setStreamingText("");
    }
    if (event.type === "turn.failed") {
      setMessages(prev => [...prev, `error: ${event.message}`]);
    }
  }
  setStreaming(false);
}
```

## Ask Command Streaming

`ask` is one-shot. It runs the turn loop to completion, then exits:

```ts
// In index.tsx or a dedicated runner
for await (const event of runTurn(runtime, provider, prompt)) {
  if (event.type === "assistant.delta") process.stdout.write(event.text);
  if (event.type === "turn.failed") process.stderr.write(`error: ${event.message}\n`);
}
```

This replaces the current `handlePrompt` string return.

## File Map (new files)

```text
src/
  providers/
    provider.ts        # Provider, ProviderTurnRequest, ProviderMessage, ToolSpec
    mock.ts            # MockProvider
  runtime/
    loop.ts            # runTurn(), buildMessages()
  ui/
    views/
      TuiView.tsx      # updated: streaming via runTurn
      AskView.tsx      # updated: streaming output
```

## Migration Plan

1. Add `providers/provider.ts` and `providers/mock.ts`.
2. Add `runtime/loop.ts`.
3. Update `TuiView` and `AskView` to use `runTurn` with `MockProvider`.
4. Deprecate `handlePrompt` (keep for one release, mark `@deprecated`).
5. Default provider in `bootRuntime` is `MockProvider`.

## Verification

- `kintsugi ask "hello"` streams "Mock response received." through delta events.
- `kintsugi tui` sends a message and sees streaming assistant text.
- Tests: mock provider event sequence, turn loop yields correct event order, buildMessages includes Echo.
