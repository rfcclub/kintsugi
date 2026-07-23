import React from "react";
import { Box, Text } from "ink";

interface StatusBarProps {
  mode: string;
  model?: string;
  streaming?: boolean;
  messageCount?: number;
}

export function StatusBar({ mode, model, streaming, messageCount }: StatusBarProps) {
  const modeColor = mode === "auto" ? "green" : mode === "plan" ? "yellow" : "cyan";

  return (
    <Box paddingX={1} justifyContent="space-between">
      <Box>
        <Text color={modeColor} bold>{mode}</Text>
        <Text color="gray">{" . "}</Text>
        <Text color="gray">{model ?? "mock"}</Text>
      </Box>
      <Box>
        {typeof messageCount === "number" ? (
          <>
            <Text color="gray">{messageCount} msgs</Text>
            <Text color="gray">{" . "}</Text>
          </>
        ) : null}
        {streaming ? (
          <Text color="green" bold>streaming</Text>
        ) : (
          <Text color="gray" dimColor>ready</Text>
        )}
        <Text color="gray">{" . "}</Text>
        <Text color="gray" dimColor>Shift+Tab</Text>
      </Box>
    </Box>
  );
}
