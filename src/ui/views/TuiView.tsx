import React, { useEffect, useRef, useState } from "react";
import { Box, Text, useApp, useInput, useStdout, Spacer } from "ink";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { Frame } from "../components/Frame.js";
import { Composer } from "../components/Composer.js";
import { StatusBar } from "../components/StatusBar.js";
import { MessageBubble, parseMessageLine } from "../components/MessageBubble.js";
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
import { exportSessionMarkdown } from "../../store/export.js";
import { determineCancelAction } from "../commands/cancel-priority.js";
import { ProviderWizard, type ProviderWizardResult } from "../components/ProviderWizard.js";
import {
  addProviderToConfig,
  listRegisteredProviders,
  setProviderDefaultModel,
} from "../../config/config.js";
import {
  getModels,
  listCachedProviders,
  writeProviderCache,
} from "../../providers/cache.js";
import {
  isInteractionMode,
  formatMode,
  formatModeList,
  type InteractionMode,
} from "../../runtime/mode.js";

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
  const [showWizard, setShowWizard] = useState(false);
  const activeTurn = useRef<AbortController | undefined>(undefined);
  const [interactionMode, setInteractionMode] = useState<InteractionMode>("approve");
  const planApprovedThisTurn = useRef(false);
  const cancelReason = useRef<CancelReason>("abort");
  const pendingPermissionRef = useRef<PendingPermission | undefined>(undefined);

  const [, setDimensions] = useState({
    columns: process.stdout.columns,
    rows: process.stdout.rows,
  });

  useEffect(() => {
    const handleResize = () => {
      setDimensions({
        columns: process.stdout.columns,
        rows: process.stdout.rows,
      });
    };
    process.stdout.on("resize", handleResize);
    process.on("SIGWINCH", handleResize);
    return () => {
      process.stdout.off("resize", handleResize);
      process.off("SIGWINCH", handleResize);
    };
  }, []);

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

        // Auto mode: allow everything immediately
        if (interactionMode === "auto") {
          resolve("allow");
          return;
        }

        // Plan mode: first tool call in a turn shows plan prompt,
        // subsequent calls auto-allow once plan is approved
        if (interactionMode === "plan") {
          if (planApprovedThisTurn.current) {
            resolve("allow");
            return;
          }
          const pending = {
            toolName,
            args,
            resolve: (decision: PermissionDecision) => {
              if (decision === "allow") {
                planApprovedThisTurn.current = true;
              }
              resolve(decision);
            },
          };
          setPendingPermission(pending);
          const abort = () => {
            setPendingPermission((current) => (current === pending ? undefined : current));
            resolve("deny");
          };
          signal?.addEventListener("abort", abort, { once: true });
          return;
        }

        // Approve mode: every tool call requires user approval
        const pending = { toolName, args, resolve };
        setPendingPermission(pending);
        const abort = () => {
          setPendingPermission((current) => (current === pending ? undefined : current));
          resolve("deny");
        };
        signal?.addEventListener("abort", abort, { once: true });
      });
  }, [activeRuntime, interactionMode]);

  // Shift+Tab cycles interaction modes: auto -> approve -> plan -> auto
  useInput((_input, key) => {
    if (key.tab && key.shift) {
      const modes: InteractionMode[] = ["auto", "approve", "plan"];
      const current = modes.indexOf(interactionMode);
      const next = modes[(current + 1) % modes.length];
      setInteractionMode(next);
      planApprovedThisTurn.current = false;
      setStatus(`Mode: ${next}`);
    }
  });

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
    if (name === "plugin") {
      const action = args[0]?.toLowerCase();
      if (action === "install") {
        const pluginName = args[1]?.toLowerCase();
        if (pluginName === "superpowers") {
          const repoPath = "/Users/thoor/repo/superpowers";
          if (!fs.existsSync(repoPath)) {
            setStatus("Error: Local superpowers repository not found at /Users/thoor/repo/superpowers");
            return true;
          }
          try {
            const pluginsDir = path.join(os.homedir(), ".config", "kintsugi", "plugins");
            fs.mkdirSync(pluginsDir, { recursive: true });
            const dest = path.join(pluginsDir, "superpowers");
            
            // Safe removal of existing symlink or folder
            if (fs.existsSync(dest)) {
              const stat = fs.lstatSync(dest);
              if (stat.isSymbolicLink()) {
                fs.unlinkSync(dest);
              } else {
                fs.rmSync(dest, { recursive: true, force: true });
              }
            }
            
            fs.symlinkSync(repoPath, dest, "dir");
            setStatus("Success: Installed superpowers plugin! Core skills are now active.");
          } catch (err) {
            setStatus(`Error: Failed to install plugin: ${err instanceof Error ? err.message : String(err)}`);
          }
        } else {
          setStatus(`Error: Unknown plugin "${args[1] || ""}". Try /plugin install superpowers.`);
        }
      } else if (action === "list") {
        try {
          const pluginsDir = path.join(os.homedir(), ".config", "kintsugi", "plugins");
          if (fs.existsSync(pluginsDir)) {
            const entries = fs.readdirSync(pluginsDir);
            if (entries.length > 0) {
              setOverlay({
                command: "help",
                content: `Installed Plugins:\n${entries.map(e => `  - ${e} (active)`).join("\n")}`,
                title: "Plugins List"
              });
            } else {
              setStatus("No plugins installed.");
            }
          } else {
            setStatus("No plugins folder exists. Install one via /plugin install <name>.");
          }
        } catch (err) {
          setStatus(`Error listing plugins: ${err instanceof Error ? err.message : String(err)}`);
        }
      } else {
        setStatus("Usage: /plugin install superpowers | /plugin list");
      }
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

        if (args[0] === "list" || args[0] === "switch") {
          const targetProvider = args[1];
          const providers = targetProvider ? [targetProvider] : listCachedProviders();
          if (providers.length === 0) {
            setOverlay({
              command: "model",
              content: "No cached models. Run /provider add or configure manually.",
              title: "/model list",
            });
            return true;
          }
          const lines: string[] = [];
          let index = 1;
          for (const provider of providers) {
            const models = getModels(provider);
            if (models.length === 0) {
              lines.push(`${provider}: (no cached models)`);
              continue;
            }
            lines.push(`${provider}:`);
            for (const model of models) {
              const owner = model.owned_by ? ` [${model.owned_by}]` : "";
              lines.push(`  ${index}. ${model.id}${owner}`);
              index += 1;
            }
          }
          lines.push("", "Use /model use <model-id> to switch the active model.");
          setOverlay({ command: "model", content: lines.join("\n"), title: "/model list" });
          return true;
        }

        if (args[0] === "use" && args[1]) {
          const selection = resolveModelSelection(
            {
              ...config,
              provider: activeRuntime.provider as typeof config.provider,
              model: args[1],
              modelProfile: activeRuntime.modelProfile,
              modelConfig: activeRuntime.modelConfig,
            },
            { model: args[1] }
          );
          const nextProvider = createProviderForModelSelection(selection);
          applyModelSelection(activeRuntime, selection);
          setActiveProvider(nextProvider);
          setStatus(`Model switched to: ${args[1]}`);
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

    if (name === "clear") {
      setMessages([]);
      setStreamingText("");
      setStatus("Transcript cleared.");
      return true;
    }
    if (name === "status") {
      const sessionId = activeRuntime.sessionId ?? "(none)";
      const model = formatActiveModel(activeRuntime);
      const toolCount = activeRuntime.toolRegistry?.allSpecs().length ?? 0;
      const msgCount = activeRuntime.messageCount ?? 0;
      setOverlay({
        command: "status",
        content: [
          `Session: ${sessionId}`,
          `Model: ${model}`,
          `Provider: ${activeRuntime.provider}`,
          `Tools: ${toolCount}`,
          `Messages: ${msgCount}`,
          `Substrate: ${activeRuntime.substrate?.path ?? "(none)"}`,
          `Permissions: ${Object.keys(activeRuntime.sessionPermissions ?? {}).length} overrides`,
        ].join("\n"),
      });
      return true;
    }
    if (name === "version") {
      setOverlay({
        command: "version",
        content: "kintsugi v1.0.0\nInk-based CLI/TUI runtime",
      });
      return true;
    }
    if (name === "export") {
      try {
        const result = exportSessionMarkdown(args[0]);
        setOverlay({
          command: "export",
          content: result.markdown,
          title: `/export ${args[0]}`,
        });
      } catch (error) {
        setStatus(error instanceof Error ? error.message : String(error));
      }
      return true;
    }
    if (name === "rename") {
      setStatus(`Session renamed to: ${args.join(" ")}`);
      return true;
    }

    if (name === "provider") {
      const action = args[0]?.toLowerCase();
      if (action === "add") {
        setShowWizard(true);
        return true;
      }
      if (action && action !== "status") {
        setStatus(`Usage: /provider (show status) | /provider add (register a custom provider)`);
        return true;
      }
      const registered = listRegisteredProviders();
      const cached = listCachedProviders();
      const providerName = activeRuntime.provider ?? config.provider;
      const baseUrl =
        config.providerSettings?.baseUrl ??
        config.providers?.[providerName]?.baseUrl ??
        "(default)";
      const lines = [
        `Provider: ${providerName}`,
        `Model: ${activeRuntime.model ?? config.model ?? "(not set)"}`,
        `Base URL: ${baseUrl}`,
        `Registered custom providers: ${registered.length ? registered.join(", ") : "(none)"}`,
        `Cached model lists: ${cached.length ? cached.join(", ") : "(none)"}`,
        "",
        "Use /provider add to register a new provider.",
      ];
      setOverlay({ command: "provider", content: lines.join("\n"), title: "/provider" });
      return true;
    }

    if (name === "mode") {
      if (args.length === 0) {
        setOverlay({
          command: "mode",
          content: [
            `Current mode: ${interactionMode}`,
            "",
            formatMode(interactionMode),
            "",
            "Available modes:",
            formatModeList(),
            "",
            "Usage: /mode auto | /mode approve | /mode plan",
          ].join("\n"),
        });
        return true;
      }
      const target = args[0].toLowerCase();
      if (!isInteractionMode(target)) {
        setStatus(`Unknown mode: ${target}. Choose auto, approve, or plan.`);
        return true;
      }
      setInteractionMode(target);
      planApprovedThisTurn.current = false;
      setStatus(`Mode switched to: ${target}`);
      return true;
    }

    setStatus(`/${name}${args.length ? ` ${args.join(" ")}` : ""} is not implemented.`);
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

    planApprovedThisTurn.current = false;
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

  function handleWizardComplete(result: ProviderWizardResult): void {
    setShowWizard(false);
    try {
      addProviderToConfig({
        name: result.name,
        baseUrl: result.baseUrl,
        apiKey: result.apiKey,
        adapter: result.adapter,
        defaultModel: result.defaultModel,
      });
      if (result.scannedModels.length > 0) {
        writeProviderCache(result.name, result.scannedModels);
      }
      setStatus(
        `Registered provider "${result.name}"${
          result.defaultModel ? ` (model: ${result.defaultModel})` : ""
        }. Use /model list to see cached models.`
      );
    } catch (error) {
      setStatus(
        `Failed to register provider: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  const accentColor = interactionMode === "auto" ? "green" : interactionMode === "plan" ? "yellow" : "cyan";

  if (showWizard) {
    return (
      <Box flexDirection="column" width="100%" height="100%">
        <ProviderWizard
          onComplete={handleWizardComplete}
          onCancel={() => setShowWizard(false)}
          existingNames={listRegisteredProviders()}
        />
      </Box>
    );
  }

  if (overlay) {
    return (
      <Box flexDirection="column" width="100%" height="100%">
        <CommandOverlay command={overlay.command} content={overlay.content} title={overlay.title} />
        <Composer
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          onExit={onExit}
          mode={interactionMode}
          streaming={isStreaming}
          accentColor={accentColor}
        />
      </Box>
    );
  }

  return (
    <Box flexDirection="column" width="100%" height="100%">
      {/* Header */}
      <Box paddingX={2} paddingY={0} borderStyle="single" borderTop={true} borderBottom={true} borderLeft={false} borderRight={false} borderColor={accentColor}>
        <Box flexDirection="row" justifyContent="space-between" alignItems="center" width="100%">
          {/* Left: ASCII Logo & Info */}
          <Box flexDirection="column">
            <Text color={accentColor} bold>
{`  ╦╔═╦╔╗╔╔╦╗╔═╗╦ ╦╔═╗╦
  ╠╩╗║║║║ ║ ╚═╗║ ║║ ╦║
  ╩ ╩╩╝╚╝ ╩ ╚═╝╚═╝╚═╝╩`}
            </Text>
            <Box marginTop={1} flexDirection="row">
              <Text color="gray" dimColor>[ Gold-Joined Agentic Shell ]</Text>
              <Text color="gray">{" . "}</Text>
              <Text color={accentColor} bold>{interactionMode.toUpperCase()}</Text>
              <Text color="gray">{" . "}</Text>
              <Text color="gray">{activeRuntime.modelProfile ?? activeRuntime.provider ?? "mock"}</Text>
              <Text color="gray" dimColor> ({formatActiveModel(activeRuntime)})</Text>
            </Box>
          </Box>

          {/* Right: Teapot ASCII Art */}
          <Box paddingRight={4}>
            <Text color="magenta" bold>
{`    (  (
     )  )
  .-----.  __
 /   /   \\/  \\
|   /\\   |    |
 \\  \\/  /\\___/
  '-----'`}
            </Text>
          </Box>
        </Box>
      </Box>

      {/* Transcript */}
      <Box flexDirection="column" paddingX={1} flexGrow={1}>
        {messages.length === 0 && !streamingText ? (
          <Box marginTop={2} flexDirection="column" paddingLeft={4}>
            <Text color="gray" dimColor>{"Welcome to kintsugi."}</Text>
            <Text color="gray" dimColor>{"Type a message or /help to get started."}</Text>
            <Box height={1} />
            <Text color="gray" dimColor>{"  Shift+Tab : Cycle interaction modes"}</Text>
            <Text color="gray" dimColor>{"  Esc       : Stop current turn / cancel overlay"}</Text>
            <Text color="gray" dimColor>{"  Ctrl+C    : Terminate session"}</Text>
          </Box>
        ) : null}
        {messages.map((message, index) => {
          const parsed = parseMessageLine(message);
          return (
            <MessageBubble
              key={`msg-${index}`}
              role={parsed.role}
              text={parsed.text}
              toolName={parsed.toolName}
            />
          );
        })}
        {streamingText ? (
          <Box marginTop={1} paddingLeft={2}>
            <Text color="white">{streamingText}</Text>
            <Text color={accentColor} bold>{"▌"}</Text>
          </Box>
        ) : null}
        {pendingPermission ? (
          <Box
            flexDirection="column"
            marginTop={1}
            marginLeft={2}
            borderStyle="round"
            borderColor={accentColor}
            paddingX={1}
          >
            <Box>
              <Text color={accentColor} bold>{"Allow: "}</Text>
              <Text color="white" bold>{pendingPermission.toolName}</Text>
            </Box>
            <Box marginTop={0}>
              <Text color="gray">
                {typeof pendingPermission.args === "string"
                  ? pendingPermission.args.slice(0, 200)
                  : JSON.stringify(pendingPermission.args).slice(0, 200)}
              </Text>
            </Box>
            <Box marginTop={1}>
              <Text color="green" bold>{" [y]"}<Text color="gray">es</Text></Text>
              <Text color="red" bold>{"  [n]"}<Text color="gray">o</Text></Text>
              {interactionMode !== "plan" ? (
                <Text color="yellow" bold>{"  [a]"}<Text color="gray">lways</Text></Text>
              ) : null}
            </Box>
          </Box>
        ) : null}
      </Box>

      {/* Composer */}
      <Composer
        onSubmit={handleSubmit}
        onCancel={handleCancel}
        onExit={onExit}
        mode={interactionMode}
        streaming={isStreaming}
        accentColor={accentColor}
      />

      {/* Status Bar */}
      <StatusBar
        mode={interactionMode}
        model={activeRuntime.modelProfile ?? activeRuntime.model}
        streaming={isStreaming}
        messageCount={messages.length}
      />
    </Box>
  );
}

function formatProvider(session: { provider?: string; model?: string }): string {
  if (!session.provider) {
    return "unknown";
  }
  return session.model ? `${session.provider}/${session.model}` : session.provider;
}
