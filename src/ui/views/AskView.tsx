import React, { useEffect, useState } from "react";
import { Text, useApp } from "ink";
import { Frame } from "../components/Frame.js";
import type { KintsugiRuntime } from "../../runtime/runtime.js";
import { runTurn } from "../../runtime/loop.js";
import type { Provider } from "../../providers/provider.js";

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
      onDone?.();
      setTimeout(exit, 300);
    }

    void run();
    return () => {
      active = false;
    };
  }, [exit, onDone, provider, prompt, runtime]);

  return (
    <Frame title="kintsugi ask">
      <Text color="cyan">Prompt</Text>
      <Text>{prompt ?? ""}</Text>
      <Text></Text>
      <Text color={error ? "red" : "green"}>{error ? "Error" : "Assistant"}</Text>
      <Text>{error ?? (response ? response : thinking)}</Text>
    </Frame>
  );
}
