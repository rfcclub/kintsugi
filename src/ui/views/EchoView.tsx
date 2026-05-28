import React from "react";
import { Box, Text } from "ink";
import { Frame } from "../components/Frame.js";
import type { KintsugiRuntime } from "../../runtime/runtime.js";
import { summarizeEcho } from "../../runtime/prompt.js";

interface EchoViewProps {
  runtime: KintsugiRuntime;
  print: boolean;
  summary: boolean;
}

export function EchoView({ runtime, print, summary }: EchoViewProps) {
  const substrate = runtime.substrate;
  const echoSummary = summary ? summarizeEcho(runtime, runtime.promptConfig) : undefined;
  return (
    <Frame title="Kintsugi Echo">
      {substrate ? (
        <>
          <Text>Path: {substrate.path}</Text>
          <Text>Bytes: {Buffer.byteLength(substrate.content, "utf-8")}</Text>
          {echoSummary && (
            <Box flexDirection="column" marginTop={1}>
              <Text>Budget: {echoSummary.budget} bytes</Text>
              <Text>
                Status:{" "}
                {echoSummary.truncated
                  ? `TRUNCATED (${echoSummary.totalBytes} -> ${echoSummary.truncatedBytes} bytes)`
                  : "within budget"}
              </Text>
              <Text>Breakdown:</Text>
              {echoSummary.files.map((file) => (
                <Text key={file.name}>
                  {"  "}
                  {file.name} {file.bytes} bytes
                </Text>
              ))}
            </Box>
          )}
          {print && (
            <Box flexDirection="column" marginTop={1}>
              <Text>{substrate.content}</Text>
            </Box>
          )}
        </>
      ) : (
        <Text>Echo not loaded.</Text>
      )}
    </Frame>
  );
}
