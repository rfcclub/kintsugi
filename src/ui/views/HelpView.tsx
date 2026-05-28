import React from "react";
import { Text } from "ink";
import { Frame } from "../components/Frame.js";

interface HelpViewProps {
  title?: string;
  lines?: string[];
}

export function HelpView({ title = "kintsugi", lines }: HelpViewProps) {
  if (lines) {
    return (
      <Frame title={title}>
        {lines.map((line, index) => (
          <Text key={`${index}-${line}`}>{line}</Text>
        ))}
      </Frame>
    );
  }

  return (
    <Frame title={title}>
      <Text>Usage:</Text>
      <Text>  kintsugi tui</Text>
      <Text>  kintsugi ask "prompt"</Text>
      <Text>  kintsugi threads</Text>
      <Text>  kintsugi boot</Text>
      <Text>  kintsugi echo --print</Text>
      <Text>  kintsugi echo --summary</Text>
      <Text>  kintsugi config init</Text>
      <Text></Text>
      <Text>Options:</Text>
      <Text>  --provider &lt;id&gt;     mock, openai-chat, openai-responses, anthropic-messages</Text>
      <Text>  --model &lt;id&gt;        Override provider model</Text>
      <Text>  --substrate &lt;path&gt;   Echo file or directory</Text>
      <Text>  KINTSUGI_WORKSPACE   Kintsugi workspace context path</Text>
      <Text>  --no-substrate       Boot without Echo</Text>
      <Text>  --summary            Show Echo layer breakdown</Text>
    </Frame>
  );
}
