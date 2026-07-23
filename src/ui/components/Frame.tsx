import React from "react";
import { Box, Text } from "ink";

interface FrameProps {
  title: string;
  children: React.ReactNode;
  subtitle?: string;
  accent?: string;
}

export function Frame({ title, children, subtitle, accent = "cyan" }: FrameProps) {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={accent} paddingX={1}>
      <Box justifyContent="space-between">
        <Box>
          <Text color={accent} bold> {title}</Text>
          {subtitle ? <Text color="gray"> {subtitle}</Text> : null}
        </Box>
        <Text color={accent}>kintsugi</Text>
      </Box>
      <Box flexDirection="column" marginTop={0}>{children}</Box>
    </Box>
  );
}
