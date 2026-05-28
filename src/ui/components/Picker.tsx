import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import { Frame } from "./Frame.js";

interface PickerProps {
  onPick: (provider: string, model: string) => void;
}

const PROVIDERS = [
  { id: "mock", label: "Mock", desc: "Local mock provider (no API key)" },
  { id: "openai-chat", label: "OpenAI Chat", desc: "OpenAI Chat Completions API" },
  { id: "openai-responses", label: "OpenAI Responses", desc: "OpenAI Responses API" },
  { id: "anthropic-messages", label: "Anthropic", desc: "Anthropic Messages API" },
];

const DEFAULT_MODELS: Record<string, string> = {
  mock: "mock-model",
  "openai-chat": "gpt-4o-mini",
  "openai-responses": "gpt-4.1-mini",
  "anthropic-messages": "claude-sonnet-4-5",
};

type Step = "provider" | "model";

export function Picker({ onPick }: PickerProps) {
  const [step, setStep] = useState<Step>("provider");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedProvider, setSelectedProvider] = useState("");
  const [modelInput, setModelInput] = useState("");
  const [modelCursor, setModelCursor] = useState(0);

  useInput((input, key) => {
    if (step === "provider") {
      if (key.upArrow || input === "k") {
        setSelectedIndex((i) => (i > 0 ? i - 1 : PROVIDERS.length - 1));
        return;
      }
      if (key.downArrow || input === "j") {
        setSelectedIndex((i) => (i < PROVIDERS.length - 1 ? i + 1 : 0));
        return;
      }
      if (key.return || input === " ") {
        const provider = PROVIDERS[selectedIndex];
        setSelectedProvider(provider.id);
        setModelInput(DEFAULT_MODELS[provider.id]);
        setModelCursor(DEFAULT_MODELS[provider.id].length);
        setStep("model");
        return;
      }
    }

    if (step === "model") {
      if (key.return) {
        const model = modelInput.trim() || DEFAULT_MODELS[selectedProvider];
        onPick(selectedProvider, model);
        return;
      }
      if (key.backspace || input === "\b") {
        if (modelCursor > 0) {
          setModelInput((prev) => prev.slice(0, modelCursor - 1) + prev.slice(modelCursor));
          setModelCursor((c) => c - 1);
        }
        return;
      }
      if (key.delete) {
        if (modelCursor < modelInput.length) {
          setModelInput((prev) => prev.slice(0, modelCursor) + prev.slice(modelCursor + 1));
        }
        return;
      }
      if (key.leftArrow && modelCursor > 0) {
        setModelCursor((c) => c - 1);
        return;
      }
      if (key.rightArrow && modelCursor < modelInput.length) {
        setModelCursor((c) => c + 1);
        return;
      }
      if (input && input.length === 1 && input.charCodeAt(0) >= 32) {
        setModelInput((prev) => prev.slice(0, modelCursor) + input + prev.slice(modelCursor));
        setModelCursor((c) => c + 1);
      }
    }
  });

  if (step === "provider") {
    return (
      <Frame title="kintsugi — select provider">
        <Box flexDirection="column">
          <Text color="gray">↑↓ or j/k to navigate, Enter to select, q to quit</Text>
          <Box flexDirection="column" marginTop={1}>
            {PROVIDERS.map((p, i) => (
              <Box key={p.id}>
                <Text color={i === selectedIndex ? "cyan" : "white"}>
                  {i === selectedIndex ? "▸ " : "  "}
                </Text>
                <Text color={i === selectedIndex ? "cyan" : "white"} bold={i === selectedIndex}>
                  {p.label.padEnd(20)}
                </Text>
                <Text color="gray">{p.desc}</Text>
              </Box>
            ))}
          </Box>
        </Box>
      </Frame>
    );
  }

  return (
    <Frame title="kintsugi — model name">
      <Box flexDirection="column">
        <Text color="cyan">Provider: {selectedProvider}</Text>
        <Text color="gray">Enter to confirm, type to edit model name</Text>
        <Box marginTop={1}>
          <Text color="green">▸ </Text>
          <Text>{modelInput.slice(0, modelCursor)}</Text>
          <Text inverse> </Text>
          <Text>{modelInput.slice(modelCursor)}</Text>
        </Box>
      </Box>
    </Frame>
  );
}
