#!/usr/bin/env node

import { createServer } from "node:http";
import { once } from "node:events";
import { bootRuntime } from "../dist/runtime/runtime.js";
import { runTurn } from "../dist/runtime/loop.js";
import { createProvider } from "../dist/providers/registry.js";

const apiKey = "local-valid-key";

async function main() {
  await withServer(async (server) => {
    const baseUrl = `http://127.0.0.1:${server.address().port}/v1`;

    await smokeAsk({
      provider: "openai-chat",
      model: "chat-smoke",
      baseUrl,
      prompt: "Say CHAT_OK.",
      expect: "CHAT_OK",
    });

    await smokeAsk({
      provider: "openai-responses",
      model: "responses-smoke",
      baseUrl,
      prompt: "Say RESPONSES_OK.",
      expect: "RESPONSES_OK",
    });

    await smokeAsk({
      provider: "anthropic-messages",
      model: "anthropic-smoke",
      baseUrl,
      prompt: "Say ANTHROPIC_OK.",
      expect: "ANTHROPIC_OK",
    });

    await smokeAsk({
      provider: "openai-chat",
      model: "tool-smoke",
      baseUrl,
      prompt: "Use read_file to read src/cli/args.ts.",
      expect: "TOOL_OK",
    });
  });

  await smokeCancellation("stop");
  await smokeCancellation("esc");
  console.log("[open-phases] smoke passed");
}

async function withServer(run) {
  const requests = [];
  const server = createServer(async (req, res) => {
    try {
      const body = await readBody(req);
      const parsed = body ? JSON.parse(body) : {};
      requests.push({ url: req.url, headers: req.headers, body: parsed });

      assertAuth(req);
      if (req.url === "/v1/chat/completions") {
        return handleChat(parsed, res);
      }
      if (req.url === "/v1/responses") {
        return writeSse(res, [
          sse("response.created", { type: "response.created", response: { id: "resp-smoke" } }),
          sse("response.output_text.delta", { type: "response.output_text.delta", delta: "RESPONSES_OK" }),
          sse("response.completed", {
            type: "response.completed",
            response: { status: "completed", usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } },
          }),
          "data: [DONE]\n\n",
        ]);
      }
      if (req.url === "/v1/messages") {
        if (req.headers["x-api-key"] !== apiKey) {
          throw new Error("missing anthropic api key");
        }
        return writeSse(res, [
          sse("message_start", { type: "message_start", message: { id: "anthropic-smoke", usage: { input_tokens: 1 } } }),
          sse("content_block_delta", { type: "content_block_delta", delta: { type: "text_delta", text: "ANTHROPIC_OK" } }),
          sse("message_delta", { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 1 } }),
          sse("message_stop", { type: "message_stop" }),
        ]);
      }
      res.writeHead(404).end("not found");
    } catch (error) {
      console.error("[open-phases] local server error:", error?.message ?? error);
      res.writeHead(500, { "content-type": "text/plain" }).end(String(error?.message ?? error));
    }
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    await run(server, requests);
  } finally {
    server.close();
  }
}

function handleChat(body, res) {
  const last = body.messages?.at(-1);
  if (body.model === "tool-smoke" && last?.role !== "tool") {
    if (!Array.isArray(body.tools) || !body.tools.some((tool) => tool.name === "read_file" || tool.function?.name === "read_file")) {
      throw new Error("read_file tool spec was not sent");
    }
    return writeSse(res, [
      `data: ${JSON.stringify({
        id: "chat-tool-smoke",
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  id: "call-read-args",
                  function: {
                    name: "read_file",
                    arguments: JSON.stringify({ path: "src/cli/args.ts", limit: 12 }),
                  },
                },
              ],
            },
            finish_reason: "tool_calls",
            index: 0,
          },
        ],
      })}\n\n`,
      "data: [DONE]\n\n",
    ]);
  }

  if (body.model === "tool-smoke") {
    if (last?.role !== "tool" || !String(last.content).includes("ProviderType")) {
      throw new Error(`read_file tool result was not continued back to provider: ${JSON.stringify(last)}`);
    }
    return writeChatText(res, "TOOL_OK");
  }

  return writeChatText(res, "CHAT_OK");
}

function writeChatText(res, text) {
  return writeSse(res, [
    `data: ${JSON.stringify({ id: "chat-smoke", choices: [{ delta: { content: text }, finish_reason: null, index: 0 }] })}\n\n`,
    `data: ${JSON.stringify({
      id: "chat-smoke",
      choices: [{ delta: {}, finish_reason: "stop", index: 0 }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    })}\n\n`,
    "data: [DONE]\n\n",
  ]);
}

function writeSse(res, chunks) {
  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
  });
  for (const chunk of chunks) {
    res.write(chunk);
  }
  res.end();
}

function sse(event, data) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function assertAuth(req) {
  if (req.url === "/v1/messages") {
    return;
  }
  if (req.headers.authorization !== `Bearer ${apiKey}`) {
    throw new Error("missing bearer api key");
  }
}

async function smokeAsk({ provider, model, baseUrl, prompt, expect }) {
  const runtime = bootRuntime({
    provider,
    model,
    noSubstrate: true,
    workspaceRoots: [process.cwd()],
    memoryDir: tempMemoryDir(provider),
  });
  const adapter = createProvider(provider, {
    apiKey,
    baseUrl,
    model,
    maxTokens: 128,
  });
  const events = await collect(runTurn(runtime, adapter, prompt));
  const failed = events.find((event) => event.type === "turn.failed");
  const output = events
    .filter((event) => event.type === "assistant.delta" || event.type === "assistant.completed")
    .map((event) => event.text)
    .join("");

  if (failed) {
    throw new Error(`${provider} smoke failed: ${failed.message}`);
  }
  if (!output.includes(expect)) {
    throw new Error(`${provider} smoke did not include ${expect}\noutput:\n${output}`);
  }
  console.log(`[open-phases] ${provider} ask smoke passed`);
}

function tempMemoryDir(name) {
  return `/tmp/kintsugi-open-phases-${process.pid}-${name}`;
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function collect(iterable) {
  const events = [];
  for await (const event of iterable) {
    events.push(event);
  }
  return events;
}

async function smokeCancellation(reason) {
  const runtime = bootRuntime({
    provider: "mock",
    model: "cancel-smoke",
    noSubstrate: true,
    workspaceRoots: [process.cwd()],
  });
  const controller = new AbortController();
  const provider = {
    id: `slow-${reason}`,
    async *streamTurn() {
      yield { type: "turn.started", id: `slow-${reason}` };
      await new Promise((resolve) => setTimeout(resolve, 25));
      controller.abort();
      await new Promise((resolve) => setTimeout(resolve, 25));
    },
  };

  const events = [];
  for await (const event of runTurn(runtime, provider, "cancel me", undefined, {
    signal: controller.signal,
    cancelReason: reason,
  })) {
    events.push(event);
  }

  if (!events.some((event) => event.type === "turn.cancelled" && event.reason === reason)) {
    throw new Error(`${reason} cancellation smoke did not emit turn.cancelled`);
  }
  console.log(`[open-phases] ${reason} cancellation smoke passed`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
