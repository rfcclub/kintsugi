import React from "react";
import { Box, Text } from "ink";
import { ToolCallCard } from "./ToolCallCard.js";

export type MessageRole = "user" | "assistant" | "tool" | "system" | "thinking" | "error" | "tool_result";

interface ParsedToolCall {
  toolName: string;
  args?: unknown;
  result?: string;
  isError?: boolean;
}

interface MessageBubbleProps {
  role: MessageRole;
  text: string;
  toolName?: string;
}

export function MessageBubble({ role, text, toolName }: MessageBubbleProps) {
  if (role === "user") {
    return (
      <Box flexDirection="column" marginTop={1}>
        <Text color="blue" bold>{"  > "}{text}</Text>
      </Box>
    );
  }

  if (role === "assistant") {
    return (
      <Box flexDirection="column" marginTop={1}>
        {renderMarkdown(text)}
      </Box>
    );
  }

  if (role === "thinking") {
    return (
      <Box flexDirection="column" marginTop={0} paddingLeft={2}>
        <Text color="gray" dimColor>
          {"  ~ "}{text.length > 250 ? text.slice(0, 250) + "..." : text}
        </Text>
      </Box>
    );
  }

  if (role === "tool") {
    return (
      <ToolCallCard
        toolName={toolName ?? "tool"}
        result={text}
        isError={text.startsWith("Error:")}
      />
    );
  }

  if (role === "error") {
    return (
      <Box
        flexDirection="column"
        marginTop={1}
        marginLeft={2}
        borderStyle="single"
        borderColor="red"
        paddingX={1}
      >
        <Text color="red" bold>{"x "}{text}</Text>
      </Box>
    );
  }

  if (role === "system") {
    return (
      <Box flexDirection="column" marginTop={0} paddingLeft={2}>
        <Text color="yellow">{"  ! "}{text}</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginTop={0} paddingLeft={2}>
      <Text color="gray">{text}</Text>
    </Box>
  );
}

function renderMarkdown(text: string): React.ReactNode {
  const lines = text.split("\n");
  const renderedElements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeBlockLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith("```")) {
      if (inCodeBlock) {
        inCodeBlock = false;
        const codeContent = codeBlockLines.join("\n");
        renderedElements.push(
          <Box
            key={`code-${i}`}
            flexDirection="column"
            borderStyle="single"
            borderColor="gray"
            paddingX={1}
            marginLeft={2}
          >
            <Text color="cyan">{codeContent}</Text>
          </Box>
        );
        codeBlockLines = [];
      } else {
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockLines.push(line);
      continue;
    }

    // Headers
    if (line.startsWith("# ")) {
      renderedElements.push(
        <Box key={`h1-${i}`} marginTop={1} marginBottom={0} paddingLeft={2}>
          <Text color="magenta" bold>{line.slice(2).toUpperCase()}</Text>
        </Box>
      );
      continue;
    }
    if (line.startsWith("## ") || line.startsWith("### ")) {
      const sliceIdx = line.startsWith("## ") ? 3 : 4;
      renderedElements.push(
        <Box key={`h2-${i}`} marginTop={1} marginBottom={0} paddingLeft={2}>
          <Text color="yellow" bold>{line.slice(sliceIdx)}</Text>
        </Box>
      );
      continue;
    }

    // Bullet points
    if (line.trim().startsWith("- ") || line.trim().startsWith("* ")) {
      const bullet = line.trim().startsWith("- ") ? "•" : "▪";
      const cleanLine = line.trim().slice(2);
      renderedElements.push(
        <Box key={`bullet-${i}`} paddingLeft={4} flexDirection="row">
          <Text color="magenta" bold>{bullet} </Text>
          <Text>{parseInlineMarkdown(cleanLine)}</Text>
        </Box>
      );
      continue;
    }

    // Quote
    if (line.trim().startsWith("> ")) {
      renderedElements.push(
        <Box key={`quote-${i}`} paddingLeft={4}>
          <Text color="gray" italic>{"│ "}{parseInlineMarkdown(line.trim().slice(2))}</Text>
        </Box>
      );
      continue;
    }

    // Regular line
    if (line.trim() === "") {
      renderedElements.push(<Box key={`space-${i}`} height={1} />);
    } else {
      renderedElements.push(
        <Box key={`text-${i}`} paddingLeft={2}>
          <Text>{parseInlineMarkdown(line)}</Text>
        </Box>
      );
    }
  }

  return <Box flexDirection="column">{renderedElements}</Box>;
}

function parseInlineMarkdown(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*.*?\*\*|`.*?`)/g);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <Text key={index} bold color="white">
          {part.slice(2, -2)}
        </Text>
      );
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <Text key={index} color="cyan">
          {part.slice(1, -1)}
        </Text>
      );
    }
    return <Text key={index}>{part}</Text>;
  });
}

export function parseMessageLine(line: string): { role: MessageRole; text: string; toolName?: string } {
  if (line.startsWith("you: ")) return { role: "user", text: line.slice(5) };
  if (line.startsWith("error: ")) return { role: "error", text: line.slice(7) };
  if (line.startsWith("cancelled: ")) return { role: "error", text: line.slice(11) };
  if (line.startsWith("tool: ")) return { role: "tool", text: line.slice(6) };
  if (line.startsWith("thinking: ")) return { role: "thinking", text: line.slice(10) };
  return { role: "assistant", text: line };
}
