import React from "react";
import { Box, Text } from "ink";
import { Frame } from "../components/Frame.js";
import { LearnedStore } from "../../memory/learned-store.js";
import { OpsLog } from "../../memory/ops-store.js";
import { reconstruct } from "../../memory/reconstruct.js";
import type { MemoryActor, MemoryEventKind } from "../../memory/events.js";

export interface RememberOptions {
  memoryDir?: string;
  kind?: MemoryEventKind;
  actor?: MemoryActor;
  limit?: number;
  learned?: boolean;
}

export function renderRememberLines(options: RememberOptions = {}): string[] {
  const log = new OpsLog(options.memoryDir);

  if (options.learned) {
    const memory = {
      ops: log,
      learned: new LearnedStore({ memoryDir: options.memoryDir }),
      reconstruct: () => reconstruct(memory),
    };
    const state = reconstruct(memory);
    const entries = Object.entries(state.learned).sort(([a], [b]) => a.localeCompare(b));
    return entries.length === 0 ? ["No learned facts found."] : entries.map(([key, value]) => `${key}: ${value}`);
  }

  const events = log
    .query({ kind: options.kind, actor: options.actor })
    .slice(0, options.limit ?? 20);

  if (events.length === 0) {
    return ["No memory events found."];
  }

  return events.flatMap((event) => [
    `${event.kind.toUpperCase()} ${event.actor} ${formatTime(event.at)}`,
    JSON.stringify(event.payload),
  ]);
}

interface RememberViewProps {
  options?: RememberOptions;
}

export function RememberView({ options }: RememberViewProps) {
  const lines = renderRememberLines(options);

  return (
    <Frame title="kintsugi remember — memory log">
      {lines.length === 1 && lines[0].startsWith("No ") ? (
        <Text color="gray">{lines[0]}</Text>
      ) : (
        lines.map((line, i) => (
          <Box key={`${i}-${line}`} flexDirection="column">
            <Text color={line.startsWith("{") ? "white" : "cyan"}>{line}</Text>
          </Box>
        ))
      )}
    </Frame>
  );
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toISOString().replace("T", " ").replace(/\.\d+Z/, " UTC");
  } catch {
    return iso;
  }
}
