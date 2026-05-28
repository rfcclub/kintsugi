import type {
  SessionEndLine,
  SessionEventLine,
  SessionLine,
  SessionMessageLine,
  SessionStartLine,
  SessionThinkingLine,
  SessionToolCallLine,
  SessionToolResultLine,
} from "./sessions.js";
import { readSessionLog, type SessionReference } from "./replay.js";

export interface ExportSessionMarkdownResult {
  markdown: string;
  warnings: number;
}

export function exportSessionMarkdown(reference: string | SessionReference): ExportSessionMarkdownResult {
  const parsed = readSessionLog(reference);
  const start = parsed.lines.find(isStartLine);
  const end = [...parsed.lines].reverse().find(isEndLine);
  const lines: string[] = [];

  lines.push(`# Session: ${start?.id ?? "unknown"}`, "");

  if (start?.startedAt) {
    lines.push(`**Started**: ${formatDate(start.startedAt)}`);
  }

  if (start?.provider) {
    lines.push(`**Provider**: ${start.model ? `${start.provider}/${start.model}` : start.provider}`);
  }

  if (start?.echo) {
    lines.push(`**Echo**: ${start.echo}`);
  }

  lines.push("", "---", "");

  for (const line of parsed.lines) {
    if (isMessageLine(line)) {
      appendMessage(lines, line);
    }

    if (isToolCallLine(line)) {
      appendToolCall(lines, line);
    }

    if (isThinkingLine(line)) {
      appendThinking(lines, line);
    }

    if (isToolResultLine(line)) {
      appendToolResult(lines, line);
    }

    if (isEventLine(line)) {
      appendEvent(lines, line);
    }
  }

  if (end?.endedAt) {
    lines.push("---", "", `**Ended**: ${formatDate(end.endedAt)}`);
  }

  return {
    markdown: `${lines.join("\n").trimEnd()}\n`,
    warnings: parsed.warnings,
  };
}

function appendMessage(lines: string[], message: SessionMessageLine): void {
  lines.push(`## ${titleCase(message.role)}`, "", fenceText(message.text), "");
}

function appendThinking(lines: string[], thinking: SessionThinkingLine): void {
  lines.push("## Thinking", "", thinking.text, "");
}

function appendToolCall(lines: string[], call: SessionToolCallLine): void {
  lines.push(
    `## Assistant (tool call: ${call.toolName})`,
    "",
    `[Permission: ${call.decision}]`,
    "",
    "```json",
    JSON.stringify(call.args, null, 2),
    "```",
    ""
  );
}

function appendToolResult(lines: string[], result: SessionToolResultLine): void {
  lines.push(
    `## Tool Result${result.isError ? " (error)" : ""}`,
    "",
    "```text",
    escapeFence(result.output),
    "```",
    ""
  );
}

function appendEvent(lines: string[], line: SessionEventLine): void {
  if (line.event.type === "turn.cancelled") {
    lines.push("## Turn Cancelled", "", `Reason: ${line.event.reason}`, "");
  }
}

function fenceText(text: string): string {
  return text.includes("```")
    ? ["````text", text, "````"].join("\n")
    : text;
}

function escapeFence(text: string): string {
  return text.replaceAll("```", "\\`\\`\\`");
}

function titleCase(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toISOString().replace("T", " ").replace(".000Z", " UTC");
}

function isThinkingLine(line: SessionLine): line is SessionThinkingLine {
  return line.type === "thinking";
}

function isStartLine(line: SessionLine): line is SessionStartLine {
  return line.type === "session.start";
}

function isEndLine(line: SessionLine): line is SessionEndLine {
  return line.type === "session.end";
}

function isMessageLine(line: SessionLine): line is SessionMessageLine {
  return line.type === "message";
}

function isToolCallLine(line: SessionLine): line is SessionToolCallLine {
  return line.type === "tool.call";
}

function isToolResultLine(line: SessionLine): line is SessionToolResultLine {
  return line.type === "tool.result";
}

function isEventLine(line: SessionLine): line is SessionEventLine {
  return line.type === "event";
}
