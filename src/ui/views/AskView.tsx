import React, { useEffect, useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import { Frame } from "../components/Frame.js";
import { StatusBar } from "../components/StatusBar.js";
import type { KintsugiRuntime } from "../../runtime/runtime.js";
import { runTurn } from "../../runtime/loop.js";
import type { Provider } from "../../providers/provider.js";
import { formatActiveModel } from "../commands/model-actions.js";

interface AskViewProps {
  runtime: KintsugiRuntime;
  provider: Provider;
  prompt?: string;
  onDone?: () => void;
}

export function AskView({ runtime, provider, prompt, onDone }: AskViewProps) {
  const { exit } = useApp();
  const [response, setResponse] = useState("");
  const [thinking, setThinking] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [streaming, setStreaming] = useState(true);

  useInput((input, key) => {
    if (key.ctrl && input === "c") {
      process.exit(0);
    }
  });

  useEffect(() => {
    let active = true;

    async function run() {
      let buffer = "";
      let thinkingBuffer = "";
      for await (const event of runTurn(runtime, provider, prompt ?? "")) {
        if (!active) {
          return;
        }
        if (event.type === "thinking.delta") {
          thinkingBuffer += event.text;
          setThinking(thinkingBuffer);
        }
        if (event.type === "assistant.delta") {
          buffer += event.text;
          setResponse(buffer);
        }
        if (event.type === "assistant.completed") {
          buffer = event.text;
          setResponse(event.text || buffer || thinkingBuffer);
        }
        if (event.type === "turn.failed") {
          setError(event.message);
        }
      }
      if (active && !buffer && thinkingBuffer) {
        setResponse(thinkingBuffer);
      }
      setStreaming(false);
      onDone?.();
      setTimeout(exit, 300);
    }

    void run();
    return () => {
      active = false;
    };
  }, [exit, onDone, provider, prompt, runtime]);

  return (
    <Box flexDirection="column">
      <Frame
        title={runtime.modelProfile ?? "ask"}
        subtitle={formatActiveModel(runtime)}
      >
        <Box flexDirection="column">
          <Text color="blue" bold> {">"} {prompt ?? ""}</Text>
          <Box marginTop={1}>
            {error ? (
              <Box flexDirection="column">
                <Text color="red" bold>x error</Text>
                <Text color="red">{error}</Text>
              </Box>
            ) : thinking && !response ? (
              <Box flexDirection="column">
                <Text color="gray" dimColor>~ {thinking.length > 200 ? thinking.slice(0, 200) + "..." : thinking}</Text>
              </Box>
            ) : (
              <Text>{response}</Text>
            )}
          </Box>
        </Box>
      </Frame>
      <StatusBar
        mode="ask"
        model={runtime.modelProfile ?? runtime.model}
        streaming={streaming}
      />
    </Box>
  );
}
