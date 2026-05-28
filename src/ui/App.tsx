import React, { useMemo, useState } from "react";
import { bootRuntime, renderBoot, type KintsugiRuntime } from "../runtime/runtime.js";
import type { Provider } from "../providers/provider.js";
import type { ParsedArgs } from "../cli/args.js";
import { SessionIndex } from "../store/index.js";
import { replaySession } from "../store/replay.js";
import { SessionWriter } from "../store/sessions.js";
import { PermissionPolicy } from "../runtime/permissions.js";
import type { ResolvedConfig } from "../config/config.js";
import { createProvider } from "../providers/registry.js";
import { HelpView } from "./views/HelpView.js";
import { EchoView } from "./views/EchoView.js";
import { AskView } from "./views/AskView.js";
import { ThreadsView } from "./views/ThreadsView.js";
import { TuiView } from "./views/TuiView.js";
import { Picker } from "./components/Picker.js";

interface AppProps {
  args: ParsedArgs;
  config: ResolvedConfig;
  provider?: Provider;
  showPicker?: boolean;
}

function useRuntime(args: ParsedArgs, config: ResolvedConfig): KintsugiRuntime {
  return useMemo(() => {
    const effectiveModel = config.model ?? config.providerSettings.model;
    const replayed = args.resume ? replaySession(args.resume).runtime : undefined;
    const writer =
      args.command === "ask" || args.command === "tui"
        ? new SessionWriter()
        : undefined;
    const runtime =
      replayed ??
      bootRuntime({
        substrate: config.substrate,
        noSubstrate: config.noSubstrate,
        provider: config.provider,
        model: effectiveModel,
        modelProfile: config.modelProfile,
        providerPreset: config.providerPreset,
        modelConfig: config.modelConfig,
        promptConfig: {
          workspacePath: config.workspace,
          workspaceBudget: config.workspaceBudget,
        },
        workspaceRoots: config.workspaceRoots,
        permissionPolicy: new PermissionPolicy(config.permissions),
      });

    runtime.provider = config.provider;
    runtime.model = effectiveModel;
    runtime.modelProfile = config.modelProfile;
    runtime.providerPreset = config.providerPreset;
    runtime.modelConfig = config.modelConfig;
    runtime.promptConfig = {
      ...runtime.promptConfig,
      workspacePath: config.workspace,
      workspaceBudget: config.workspaceBudget,
    };
    runtime.permissionPolicy = new PermissionPolicy(config.permissions);
    runtime.workspaceRoots = config.workspaceRoots;

    if (writer) {
      runtime.sessionId = writer.id;
      runtime.sessionWriter = writer;
      writer.start({
        echo: runtime.substrate?.path,
        provider: config.provider,
        model: effectiveModel,
      });
      new SessionIndex().appendStart({
        id: writer.id,
        startedAt: writer.startedAt.toISOString(),
        provider: config.provider,
        model: effectiveModel,
      });
    }

    return runtime;
  }, [args.command, args.resume, config]);
}

function finishRuntime(runtime: KintsugiRuntime, reason = "user_exit"): void {
  if (!runtime.sessionWriter) {
    return;
  }
  const end = runtime.sessionWriter.end({
    reason,
    messageCount: runtime.messageCount ?? runtime.prompts.length,
    totalTokens: runtime.totalTokens,
  });
  new SessionIndex().appendEnd({
    id: runtime.sessionWriter.id,
    startedAt: runtime.sessionWriter.startedAt.toISOString(),
    endedAt: end.endedAt,
    messageCount: runtime.messageCount ?? runtime.prompts.length,
    provider: runtime.provider,
    model: runtime.model,
    totalTokens: runtime.totalTokens,
  });
  runtime.sessionWriter.close();
}

export function App({ args, config, provider: initialProvider, showPicker }: AppProps) {
  if (args.command === "help") {
    return <HelpView />;
  }
  if (args.command === "threads") {
    return <ThreadsView exportId={args.export} />;
  }

  return <RuntimeApp args={args} config={config} provider={initialProvider} showPicker={showPicker} />;
}

function RuntimeApp({ args, config, provider: initialProvider, showPicker }: AppProps) {
  const runtime = useRuntime(args, config);
  const [provider, setProvider] = useState<Provider | undefined>(initialProvider);

  if (args.command === "echo") {
    return <EchoView runtime={runtime} print={args.print} summary={args.summary} />;
  }
  if (args.command === "boot") {
    return (
      <HelpView
        title="kintsugi boot"
        lines={renderBoot(runtime).split("\n")}
      />
    );
  }
  if (args.command === "ask" && provider) {
    return (
      <AskView
        runtime={runtime}
        provider={provider}
        prompt={args.prompt}
        onDone={() => finishRuntime(runtime)}
      />
    );
  }
  // TUI with picker
  if (showPicker && !provider) {
    return (
      <Picker
        onPick={(selectedProvider, selectedModel) => {
          const newProvider = createProvider(selectedProvider as any, {
            ...config.providerSettings,
            ...config.modelConfig,
            model: selectedModel || config.providerSettings.model,
          });
          runtime.provider = selectedProvider;
          runtime.model = selectedModel || config.providerSettings.model;
          setProvider(newProvider);
        }}
      />
    );
  }

  if (provider) {
    return <TuiView runtime={runtime} provider={provider} config={config} onExit={() => finishRuntime(runtime)} />;
  }

  return <HelpView />;
}
