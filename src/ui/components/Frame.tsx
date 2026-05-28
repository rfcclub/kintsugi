import React from "react";
import { Box, Text } from "ink";

interface FrameProps {
  title: string;
  children: React.ReactNode;
  showCandle?: boolean;
}

export function Frame({ title, children, showCandle = true }: FrameProps) {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="yellow" paddingX={1}>
      <Box justifyContent="space-between">
        <Text color="yellow">{title}</Text>
        {showCandle ? (
          <Text>
            <Text color="yellow">╷</Text>
            <Text color="gray">│</Text>
          </Text>
        ) : null}
      </Box>
      <Box flexDirection="column">{children}</Box>
    </Box>
  );
}
