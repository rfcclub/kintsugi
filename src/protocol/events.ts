export interface TokenUsage {
  prompt: number;
  completion: number;
  total: number;
}

export type RuntimeEvent =
  | { type: "turn.started"; id: string }
  | { type: "assistant.delta"; text: string }
  | { type: "assistant.completed"; text: string }
  | { type: "thinking.delta"; text: string }
  | { type: "thinking.completed"; text: string }
  | { type: "tool.requested"; id: string; name: string; args: unknown }
  | { type: "tool.completed"; id: string; output: string }
  | { type: "turn.cancelled"; reason: "stop" | "esc" | "ctrl-c" | "permission" | "abort" }
  | { type: "turn.failed"; message: string }
  | { type: "turn.truncated"; reason: string }
  | { type: "turn.completed"; usage?: TokenUsage };
