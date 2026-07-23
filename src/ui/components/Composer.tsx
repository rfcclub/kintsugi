import React, { useState, useEffect } from "react";
import { Box, Text, useInput, useApp, useStdin } from "ink";
import TextInput from "ink-text-input";
import { isMultilineChord } from "../keypress-parser.js";

interface ComposerProps {
  onSubmit: (value: string) => void | Promise<void>;
  onCancel?: (draft: string) => boolean | void;
  onExit?: () => void;
  mode?: string;
  streaming?: boolean;
  accentColor?: string;
}

export function Composer({ onSubmit, onCancel, onExit, mode, streaming, accentColor = "cyan" }: ComposerProps) {
  const { exit } = useApp();
  const [input, setInput] = useState("");
  const { internal_eventEmitter } = useStdin() as any;

  useEffect(() => {
    if (!internal_eventEmitter) return;
    const originalEmit = internal_eventEmitter.emit;
    internal_eventEmitter.emit = function (event: string, ...args: any[]) {
      if (event === "input") {
        const data = args[0];
        if (isMultilineChord(data)) {
          args[0] = "\n";
        }
      }
      return originalEmit.apply(this, [event, ...args]);
    };
    return () => {
      internal_eventEmitter.emit = originalEmit;
    };
  }, [internal_eventEmitter]);

  useInput((inputChar, key) => {
    if (key.escape) {
      if (streaming) {
        onCancel?.(input);
        setInput("");
      } else {
        const handled = onCancel?.(input) === true;
        if (!handled && input) {
          setInput("");
        }
      }
      return;
    }

    if (key.ctrl && inputChar.toLowerCase() === "c") {
      if (streaming) {
        onCancel?.(input);
        setInput("");
      } else {
        onExit?.();
        exit();
      }
      return;
    }
  });

  return (
    <Box marginTop={0} paddingX={1}>
      <Text color={accentColor} bold>{"  > "}</Text>
      <TextInput
        value={input}
        onChange={setInput}
        placeholder={streaming ? "streaming..." : "type a message or /help"}
        onSubmit={(value) => {
          onSubmit(value);
          setInput("");
        }}
      />
    </Box>
  );
}

