import React, { useState } from "react";
import { Box, Text, useInput, useApp } from "ink";
import TextInput from "ink-text-input";

interface ComposerProps {
  onSubmit: (value: string) => void | Promise<void>;
  onCancel?: (draft: string) => boolean | void;
  onExit?: () => void;
  placeholder?: string;
}

export function Composer({ onSubmit, onCancel, onExit, placeholder = "kintsugi" }: ComposerProps) {
  const { exit } = useApp();
  const [input, setInput] = useState("");

  useInput((inputChar, key) => {
    if (key.escape) {
      const handled = onCancel?.(input) === true;
      if (!handled && input) {
        setInput("");
      }
      return;
    }

    if (key.ctrl && inputChar.toLowerCase() === "c") {
      onExit?.();
      exit();
    }
  });

  return (
    <Box marginTop={1}>
      <Text color="yellow">{placeholder}&gt; </Text>
      <TextInput
        value={input}
        onChange={setInput}
        onSubmit={(value) => {
          onSubmit(value);
          setInput("");
        }}
      />
    </Box>
  );
}
