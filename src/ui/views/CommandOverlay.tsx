import React from "react";
import { Box, Text } from "ink";
import { Frame } from "../components/Frame.js";
import {
  COMMAND_INFO,
  type CommandAvailability,
  type CommandInfo,
  type OverlayCommandName,
  formatAvailability,
  listCommandInfo,
} from "../commands/command-info.js";

export interface CommandOverlayProps {
  command: OverlayCommandName;
  content?: string | readonly string[];
  title?: string;
  commands?: readonly CommandInfo[];
}

export function CommandOverlay({ command, content, title, commands }: CommandOverlayProps) {
  const info = COMMAND_INFO[command];
  const lines = normalizeContent(content);
  const heading = title ?? `/${info.name} - ${info.title}`;

  return (
    <Frame title={heading}>
      {command === "help" ? <HelpOverlay commands={commands ?? listCommandInfo()} /> : null}
      {command !== "help" ? <CommandContent info={info} lines={lines} /> : null}
    </Frame>
  );
}

function HelpOverlay({ commands }: { commands: readonly CommandInfo[] }) {
  return (
    <Box flexDirection="column">
      {commands.map((command) => (
        <Box key={command.name} flexDirection="column" marginBottom={1}>
          <Text>
            <Text color="cyan">{command.usage.padEnd(9)}</Text>
            <Text color={availabilityColor(command.availability)}>
              {formatAvailability(command.availability).padEnd(10)}
            </Text>
            <Text>{command.summary}</Text>
          </Text>
          <Text color="gray">  {command.availabilityText}</Text>
        </Box>
      ))}
    </Box>
  );
}

function CommandContent({ info, lines }: { info: CommandInfo; lines: readonly string[] }) {
  const renderedLines = lines.length > 0 ? lines : [info.placeholder];

  return (
    <Box flexDirection="column">
      <Text color="gray">{info.summary}</Text>
      <Text></Text>
      {renderedLines.map((line, index) => (
        <Text key={`${info.name}-${index}`} color={lines.length > 0 ? undefined : "gray"}>
          {line}
        </Text>
      ))}
    </Box>
  );
}

function normalizeContent(content: CommandOverlayProps["content"]): string[] {
  if (content === undefined) return [];
  if (typeof content === "string") {
    return content.split(/\r?\n/);
  }
  return [...content];
}

function availabilityColor(availability: CommandAvailability): string {
  if (availability === "available") return "green";
  if (availability === "contextual") return "yellow";
  return "gray";
}
