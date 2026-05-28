import React, { useEffect, useRef, useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import { Frame } from "../components/Frame.js";
import { Composer } from "../components/Composer.js";
import { renderBoot } from "../../runtime/runtime.js";
import type { KintsugiRuntime } from "../../runtime/runtime.js";
import { runTurn } from "../../runtime/loop.js";
import type { Provider } from "../../providers/provider.js";
import type { PermissionDecision } from "../../runtime/permissions.js";
import type { ResolvedConfig } from "../../config/config.js";
import { formatConfigShow, runConfigDoctor } from "../../config/doctor.js";
import { OpsLog } from "../../memory/ops-store.js";
import { SessionIndex } from "../../store/index.js";
import { parseSlashCommand, type SlashCommandName } from "../commands/slash.js";
import { CommandOverlay } from "./CommandOverlay.js";
import type { OverlayCommandName } from "../commands/command-info.js";
import {
  applyModelSelection,
  createProviderForModelSelection,
  formatActiveModel,
  formatModelInspect,
  formatModelProfiles,
  resolveModelSelection,
} from "../commands/model-actions.js";
import { createNewSessionRuntime, resumeSessionRuntime } from "../commands/session-actions.js";
import { determineCancelAction } from "../commands/cancel-priority.js";

interface TuiViewProps {
  runtime: KintsugiRuntime;
  provider: Provider;
  config: ResolvedConfig;
  onExit?: () => void;
}

interface PendingPermission {
  toolName: string;
  args: unknown;
  resolve: (decision: PermissionDecision) => void;
}

type CancelReason = "stop" | "esc" | "ctrl-c" | "permission" | "abort";

export function TuiView({ runtime, provider, config, onExit }: TuiViewProps) {
  const { exit } = useApp();
  const [activeRuntime, setActiveRuntime] = useState(runtime);
  const [activeProvider, setActiveProvider] = useState(provider);
  const [messages, setMessages] = useState<string[]>(
    runtime.prompts.map((message) => `${message.role}: ${message.text}`)
  );
  const [streamingText, setStreamingText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [pendingPermission, setPendingPermission] = useState<PendingPermission | undefined>();
  const [status, setStatus] = useState<string | undefined>();
  const [overlay, setOverlay] = useState<{ command: OverlayCommandName; content?: string; title?: string } | undefined>();
  const activeTurn = useRef<AbortController | undefined>(undefined);
  const cancelReason = useRef<CancelReason>("abort");
  const pendingPermissionRef = useRef<PendingPermission | undefined>(undefined);

  useEffect(() => {
    pendingPermissionRef.current = pendingPermission;
  }, [pendingPermission]);

  useEffect(() => {
    activeRuntime.permissionDecider = (toolName, args, signal) =>
      new Promise((resolve) => {
        if (signal?.aborted) {
          resolve("deny");
          return;
        }

        const pending = { toolName, args, resolve };
        setPendingPermission(pending);
        const abort = () => {
          setPendingPermission((current) => (current === pending ? undefined : current));
          resolve("deny");
        };
        signal?.addEventListener("abort", abort, { once: true });
      });
  }, [activeRuntime]);

  useInput((input) => {
    if (!pendingPermission) {
      return;
    }
    if (input === "y") {
      resolvePermission("allow");
    }
    if (input === "n") {
      resolvePermission("deny");
    }
    if (input === "a") {
      allowPermissionForSession();
    }
  });

  function resolvePermission(decision: PermissionDecision): void {
    const pending = pendingPermissionRef.current;
    if (!pending) {
      setStatus("No tool request is waiting.");
      return;
    }
    pending.resolve(decision);
    setPendingPermission(undefined);
  }

  function allowPermissionForSession(): void {
    const pending = pendingPermissionRef.current;
    if (!pending) {
      setStatus("No tool request is waiting.");
      return;
    }
    activeRuntime.sessionPermissions = {
      ...(activeRuntime.sessionPermissions ?? {}),
      [pending.toolName]: "allow",
    };
    pending.resolve("allow");
    setPendingPermission(undefined);
  }

  function stopActiveTurn(reason: CancelReason): boolean {
    const controller = activeTurn.current;
    if (!controller || controller.signal.aborted) {
      setStatus("No running turn to stop.");
      return false;
    }
    cancelReason.current = reason;
    controller.abort();
    setStatus(reason === "esc" ? "Stopped by Esc." : "Stopped current turn.");
    return true;
  }

  function handleSlash(name: SlashCommandName, args: string[]): boolean {
    if (name === "stop") {
      stopActiveTurn("stop");
      return true;
    }
    if (name === "approve") {
      resolvePermission("allow");
      return true;
    }
    if (name === "deny") {
      resolvePermission("deny");
      return true;
    }
    if (name === "always") {
      allowPermissionForSession();
      return true;
    }
    if (name === "exit") {
      onExit?.();
      exit();
      return true;
    }
    if (name === "help") {
      setOverlay({ command: "help" });
      return true;
    }
    if (name === "config") {
      setOverlay({ command: "config", content: formatConfigShow(config) });
      return true;
    }
    if (name === "doctor") {
      setOverlay({
        command: "doctor",
        content: runConfigDoctor(config)
          .map((issue) => `${issue.severity.toUpperCase()}: ${issue.message}`)
          .join("\n"),
      });
      return true;
    }
    if (name === "memory" || name === "remember") {
      const events = new OpsLog().query().slice(-20).reverse();
      setOverlay({
        command: "memory",
        content: events.length
          ? events.map((event) => `${event.at}  ${event.kind}  ${event.actor}  ${JSON.stringify(event.payload)}`).join("\n")
          : "No memory events found.",
      });
      return true;
    }
    if (name === "threads") {
      const sessions = new SessionIndex().list().slice(0, 20);
      setOverlay({
        command: "threads",
        content: sessions.length
          ? sessions.map((session) => `${session.id}  ${session.startedAt}  ${session.messageCount} messages  ${formatProvider(session)}`).join("\n")
          : "No sessions found.",
      });
      return true;
    }
    if (name === "model") {
      try {
        if (args.length === 0) {
          setOverlay({ command: "model", content: formatModelProfiles({
            ...config,
            provider: activeRuntime.provider as typeof config.provider,
            model: activeRuntime.model,
            modelProfile: activeRuntime.modelProfile,
            modelConfig: activeRuntime.modelConfig,
          }) });
          return true;
        }

        const activeSelection = resolveModelSelection({
          ...config,
          provider: activeRuntime.provider as typeof config.provider,
          model: activeRuntime.model,
          modelProfile: activeRuntime.modelProfile,
          modelConfig: activeRuntime.modelConfig,
        });

        if (args[0] === "inspect") {
          setOverlay({ command: "model", content: formatModelInspect(activeSelection), title: "/model inspect" });
          return true;
        }

        const selection = resolveModelSelection(config, { modelProfile: args[0] });
        const nextProvider = createProviderForModelSelection(selection);
        applyModelSelection(activeRuntime, selection);
        setActiveProvider(nextProvider);
        setStatus(`Model: ${formatActiveModel(selection)}`);
      } catch (error) {
        setStatus(error instanceof Error ? error.message : String(error));
      }
      return true;
    }
    if (name === "new") {
      stopActiveTurn("stop");
      const result = createNewSessionRuntime(activeRuntime, config);
      setActiveRuntime(result.runtime);
      setMessages([]);
      setStreamingText("");
      setPendingPermission(undefined);
      setStatus(`New session: ${result.runtime.sessionId ?? result.runtime.startedAt}`);
      return true;
    }
    if (name === "resume") {
      stopActiveTurn("stop");
      try {
        const result = resumeSessionRuntime(activeRuntime, args[0], config);
        setActiveRuntime(result.runtime);
        setMessages(result.runtime.prompts.map((message) => `${message.role}: ${message.text}`));
        setStreamingText("");
        setPendingPermission(undefined);
        setStatus(`Resumed ${args[0]} into ${result.runtime.sessionId ?? "new session"}.`);
      } catch (error) {
        setStatus(error instanceof Error ? error.message : String(error));
      }
      return true;
    }

    setStatus(`/${name}${args.length ? ` ${args.join(" ")}` : ""} is planned, but not wired yet.`);
    return true;
  }

  async function handleSubmit(value: string) {
    const parsed = parseSlashCommand(value);
    if (parsed.type === "prompt") {
      value = parsed.text;
    } else if (parsed.type === "command") {
      handleSlash(parsed.name, parsed.args);
      return;
    } else if (parsed.type === "error") {
      setStatus(parsed.message);
      return;
    }

    if (isStreaming) {
      setStatus("A turn is already running. Use /stop or Esc first.");
      return;
    }

    setIsStreaming(true);
    setStatus(undefined);
    setMessages((previous) => [...previous, `you: ${value}`]);
    const controller = new AbortController();
    activeTurn.current = controller;
    cancelReason.current = "abort";

    let buffer = "";
    try {
      for await (const event of runTurn(activeRuntime, activeProvider, value, undefined, {
        signal: controller.signal,
        cancelReason: () => cancelReason.current,
      })) {
        if (event.type === "assistant.delta") {
          buffer += event.text;
          setStreamingText(buffer);
        }
        if (event.type === "assistant.completed") {
          buffer = event.text;
          setMessages((previous) => [...previous, event.text]);
          setStreamingText("");
        }
        if (event.type === "turn.cancelled") {
          setMessages((previous) => [...previous, `cancelled: ${event.reason}`]);
          setStreamingText("");
        }
        if (event.type === "turn.failed") {
          setMessages((previous) => [...previous, `error: ${event.message}`]);
          setStreamingText("");
        }
        if (event.type === "tool.completed") {
          setMessages((previous) => [...previous, `tool: ${event.output}`]);
        }
      }
    } finally {
      if (activeTurn.current === controller) {
        activeTurn.current = undefined;
      }
      setIsStreaming(false);
    }
  }

  function handleCancel(draft: string): boolean {
    const action = determineCancelAction({
      hasPendingPermission: Boolean(pendingPermission),
      hasOverlay: Boolean(overlay),
      isStreaming,
      hasDraft: Boolean(draft),
    });

    switch (action) {
      case "deny-permission":
        resolvePermission("deny");
        return true;
      case "close-overlay":
        setOverlay(undefined);
        return true;
      case "stop-turn":
        stopActiveTurn("esc");
        return true;
      case "clear-draft":
        setStatus("Composer cleared.");
        return false;
      case "idle":
        setStatus("Use /exit or Ctrl-C to leave.");
        return true;
    }
  }

  return (
    <Box flexDirection="column">
      {overlay ? <CommandOverlay command={overlay.command} content={overlay.content} title={overlay.title} /> : null}
      {!overlay ? (
        <>
          <Frame title="kintsugi tui">
            <Text>{renderBoot(activeRuntime)}</Text>
            <Text color="cyan">{formatActiveModel(activeRuntime)}</Text>
            <Text color="gray">Enter sends. Esc stops work/cancels. Ctrl-C exits.</Text>
          </Frame>
          <Box flexDirection="column" marginTop={1}>
            {status ? <Text color="yellow">{status}</Text> : null}
            {messages.map((message, index) => (
              <Text key={`${index}-${message.slice(0, 12)}`}>{message}</Text>
            ))}
            {streamingText ? <Text color="green">{streamingText}</Text> : null}
            {pendingPermission ? (
              <Box flexDirection="column" marginTop={1}>
                <Text color="yellow">
                  Allow {pendingPermission.toolName}? [y]es [n]o [a]lways this session
                </Text>
                <Text color="gray">{JSON.stringify(pendingPermission.args)}</Text>
              </Box>
            ) : null}
          </Box>
        </>
      ) : null}
      <Composer onSubmit={handleSubmit} onCancel={handleCancel} onExit={onExit} />
    </Box>
  );
}

function formatProvider(session: { provider?: string; model?: string }): string {
  if (!session.provider) {
    return "unknown";
  }
  return session.model ? `${session.provider}/${session.model}` : session.provider;
}
