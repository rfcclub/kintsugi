import React from "react";
import { Box, Text } from "ink";

interface ToolCallCardProps {
  toolName: string;
  args?: unknown;
  result?: string;
  isError?: boolean;
  collapsed?: boolean;
}

export function formatArgs(args: unknown): string {
  if (!args) return "";
  if (typeof args === "string") return args;
  try {
    const obj = typeof args === "object" ? args : JSON.parse(String(args));
    return Object.entries(obj)
      .filter(([k]) => k !== "toolCallId")
      .map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`)
      .join("\n");
  } catch {
    return JSON.stringify(args);
  }
}

export function truncate(text: string, maxLines = 8): { text: string; truncated: boolean } {
  const lines = text.split("\n");
  if (lines.length <= maxLines) return { text, truncated: false };
  return { text: lines.slice(0, maxLines).join("\n"), truncated: true };
}

export function ToolCallCard({ toolName, args, result, isError, collapsed = true }: ToolCallCardProps) {
  const formattedArgs = formatArgs(args);
  const displayResult = result ? truncate(result, collapsed ? 6 : 40) : null;
  const borderLength = 60;

  return (
    <Box flexDirection="column" marginTop={1} marginLeft={2}>
      {/* Header */}
      <Box>
        <Text color="cyan">{"┌─ "}</Text>
        <Text color="cyan" bold>{toolName}</Text>
        <Text color="cyan">{" "}</Text>
        <Text color="cyan">{"─".repeat(Math.max(0, borderLength - toolName.length - 5))}{"─┐"}</Text>
      </Box>

      {/* Args */}
      {formattedArgs ? (
        <>
          {formattedArgs.split("\n").map((line, i) => (
            <Box key={`arg-${i}`}>
              <Text color="cyan">{"│ "}</Text>
              <Text color="gray">{line}</Text>
            </Box>
          ))}
        </>
      ) : null}

      {/* Result separator */}
      {displayResult ? (
        <>
          <Box>
            <Text color="cyan">{"├─ "}</Text>
            <Text color={isError ? "red" : "gray"}>{isError ? "error" : "result"}</Text>
            <Text color="cyan">{" "}</Text>
            <Text color="cyan">{"─".repeat(Math.max(0, borderLength - (isError ? 5 : 6) - 5))}{"─┤"}</Text>
          </Box>
          {displayResult.text.split("\n").map((line, i) => (
            <Box key={`res-${i}`}>
              <Text color="cyan">{"│ "}</Text>
              <Text color={isError ? "red" : "white"}>{line}</Text>
            </Box>
          ))}
          {displayResult.truncated ? (
            <Box>
              <Text color="cyan">{"│ "}</Text>
              <Text color="gray" dimColor>{"...(truncated)"}</Text>
            </Box>
          ) : null}
        </>
      ) : null}

      {/* Footer */}
      <Box>
        <Text color="cyan">{"└"}{"─".repeat(borderLength - 2)}{"┘"}</Text>
      </Box>
    </Box>
  );
}
