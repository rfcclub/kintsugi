import React, { useEffect, useState } from "react";
import { Box, Text, useInput } from "ink";
import { Frame } from "./Frame.js";
import {
  scanModels,
  testConnection,
  type ModelInfo,
} from "../../providers/scanner.js";
import {
  scanTemplates,
  type ProviderTemplate,
} from "../../providers/template-scanner.js";
import {
  resolveApiKeyRef,
  type EnvResolveResult,
} from "../../providers/env-resolver.js";

/**
 * ProviderWizard — a multi-step Ink form with three onboarding modes:
 *   1. Import from providers.d (templates with auto key detection)
 *   2. Raw (manual name/url/protocol/key/models)
 *   3. OAuth (placeholder)
 *
 * The pure validation/display helpers below are exported so they can be unit
 * tested without rendering the component (matching the project convention).
 */

export interface ProviderWizardResult {
  name: string;
  baseUrl: string;
  apiKey?: string;
  adapter?: string;
  defaultModel?: string;
  scannedModels: ModelInfo[];
}

export interface ProviderWizardProps {
  onComplete: (result: ProviderWizardResult) => void;
  onCancel: () => void;
  existingNames?: string[];
  fetchImpl?: typeof fetch;
}

type WizardMode = "import" | "raw" | "oauth";

type WizardStep =
  | "mode"
  | "templates"
  | "key-detect"
  | "name"
  | "url"
  | "protocol"
  | "key"
  | "models"
  | "test"
  | "confirm";

interface WizardState {
  step: WizardStep;
  mode: WizardMode | null;
  name: string;
  baseUrl: string;
  apiKey: string;
  adapter: string;
  keyVisible: boolean;
  useOAuth: boolean;
  error?: string;
  testStatus: "idle" | "testing" | "success" | "error";
  scanStatus: "idle" | "scanning" | "success" | "error";
  scannedModels: ModelInfo[];
  manualModel: string;
  templates: ProviderTemplate[];
  selectedTemplate: ProviderTemplate | null;
  keyResolveResult: EnvResolveResult | null;
  protocolIndex: number;
  modelSourceIndex: number;
}

export interface ValidationResult {
  ok: boolean;
  error?: string;
}

const PROTOCOL_OPTIONS = [
  { label: "OpenAI Chat Completions", adapter: "openai-chat" },
  { label: "OpenAI Responses API", adapter: "openai-responses" },
  { label: "Anthropic Messages API", adapter: "anthropic-messages" },
];

const MODEL_SOURCE_OPTIONS = [
  { label: "Auto-scan from provider", value: "auto" },
  { label: "Enter models manually", value: "manual" },
];

const MODE_OPTIONS: { mode: WizardMode; label: string; description: string }[] = [
  { mode: "import", label: "Import from providers.d", description: "Use existing provider templates" },
  { mode: "raw", label: "Custom Setup (Raw)", description: "Configure any provider manually" },
  { mode: "oauth", label: "OAuth Login", description: "Sign in with provider account" },
];

export function stepIndex(step: WizardStep): number {
  const allSteps: WizardStep[] = ["mode", "templates", "key-detect", "name", "url", "protocol", "key", "models", "test", "confirm"];
  return allSteps.indexOf(step) + 1;
}

export function stepTitle(step: WizardStep): string {
  switch (step) {
    case "mode": return "Select Mode";
    case "templates": return "Select Provider";
    case "key-detect": return "API Key";
    case "name": return "Provider Name";
    case "url": return "Base URL";
    case "protocol": return "Protocol";
    case "key": return "API Key";
    case "models": return "Models";
    case "test": return "Test & Scan";
    case "confirm": return "Confirm";
  }
}

export function validateProviderName(
  name: string,
  existingNames: string[] = []
): ValidationResult {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Name cannot be empty." };
  if (existingNames.includes(trimmed))
    return { ok: false, error: `"${trimmed}" is already registered.` };
  return { ok: true };
}

export function validateBaseUrl(url: string): ValidationResult {
  const trimmed = url.trim();
  if (!trimmed) return { ok: false, error: "URL cannot be empty." };
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
      return { ok: false, error: "URL must use http or https." };
  } catch {
    return { ok: false, error: "Invalid URL format." };
  }
  return { ok: true };
}

export function maskApiKey(key: string): string {
  if (key.length <= 2) return "•".repeat(key.length);
  const maskLen = Math.min(key.length - 2, 24);
  return "•".repeat(maskLen) + key.slice(-2);
}

export function formatScannedModels(models: ModelInfo[], max = 6): string[] {
  if (models.length === 0) {
    return ["(no models discovered — you can enter one manually)"];
  }
  const lines: string[] = [];
  const shown = models.slice(0, max);
  for (const m of shown) {
    const owner = m.owned_by ? ` [${m.owned_by}]` : "";
    lines.push(`  • ${m.id}${owner}`);
  }
  if (models.length > max) {
    lines.push(`  … and ${models.length - max} more`);
  }
  return lines;
}

export function keyStatusIcon(template: ProviderTemplate, resolveResult?: EnvResolveResult): string {
  if (!template.supported) return "⛔";
  if (template.apiKeyRef.startsWith("${OAUTH:")) return "🔑";
  if (resolveResult?.resolved) return "✅";
  return "⚠️";
}

export function keyStatusLabel(template: ProviderTemplate, resolveResult?: EnvResolveResult): string {
  if (!template.supported) return "unsupported";
  if (template.apiKeyRef.startsWith("${OAUTH:")) return "OAuth";
  if (resolveResult?.resolved) return resolveResult.source ?? "found";
  return "missing";
}

export function ProviderWizard({
  onComplete,
  onCancel,
  existingNames = [],
  fetchImpl,
}: ProviderWizardProps) {
  const [state, setState] = useState<WizardState>({
    step: "mode",
    mode: null,
    name: "",
    baseUrl: "",
    apiKey: "",
    adapter: "openai-chat",
    keyVisible: false,
    useOAuth: false,
    testStatus: "idle",
    scanStatus: "idle",
    scannedModels: [],
    manualModel: "",
    templates: [],
    selectedTemplate: null,
    keyResolveResult: null,
    protocolIndex: 0,
    modelSourceIndex: 0,
  });

  const [draft, setDraft] = useState("");
  const [cursor, setCursor] = useState(0);
  const [modeIndex, setModeIndex] = useState(0);
  const [templateIndex, setTemplateIndex] = useState(0);
  const [keyConfirmIndex, setKeyConfirmIndex] = useState(0);

  const resetDraft = () => { setDraft(""); setCursor(0); };

  useEffect(() => {
    if (state.step === "templates" && state.templates.length === 0) {
      const templates = scanTemplates();
      setState((prev) => ({ ...prev, templates }));
    }
  }, [state.step]);

  useEffect(() => {
    if (state.step === "key-detect" && state.selectedTemplate) {
      const result = resolveApiKeyRef(state.selectedTemplate.apiKeyRef);
      setState((prev) => ({ ...prev, keyResolveResult: result }));
      if (result.resolved && result.value) {
        setState((prev) => ({ ...prev, apiKey: result.value! }));
      }
    }
  }, [state.step]);

  useEffect(() => {
    if (state.step === "name") { setDraft(state.name); setCursor(state.name.length); }
    else if (state.step === "url") { setDraft(state.baseUrl); setCursor(state.baseUrl.length); }
    else if (state.step === "key") { setDraft(state.apiKey); setCursor(state.apiKey.length); }
    else if (state.step === "confirm" && state.scannedModels.length === 0) { setDraft(state.manualModel); setCursor(state.manualModel.length); }
  }, [state.step]);

  useEffect(() => {
    if (state.step !== "test" || state.testStatus !== "idle") return;
    let cancelled = false;
    const run = async () => {
      setState((prev) => ({ ...prev, testStatus: "testing", error: undefined }));
      const connection = await testConnection(state.baseUrl, state.apiKey, { fetchImpl });
      if (cancelled) return;
      if (!connection.ok) {
        setState((prev) => ({ ...prev, testStatus: "error", error: connection.error ?? "Connection failed." }));
        return;
      }
      setState((prev) => ({ ...prev, scanStatus: "scanning" }));
      const scan = await scanModels(state.baseUrl, state.apiKey, { fetchImpl });
      if (cancelled) return;
      setState((prev) => ({
        ...prev, testStatus: "success",
        scanStatus: scan.ok ? "success" : "error",
        scannedModels: scan.models,
        error: scan.ok ? undefined : scan.error,
      }));
    };
    run();
    return () => { cancelled = true; };
  }, [state.step, state.testStatus, state.baseUrl, state.apiKey, fetchImpl]);

  useInput((input, key) => {
    if (key.escape) {
      if (state.step === "mode") { onCancel(); return; }
      goBack();
      return;
    }
    if (key.ctrl && input === "c") { onCancel(); return; }

    if (state.step === "mode") {
      if (key.upArrow) { setModeIndex((i) => Math.max(0, i - 1)); return; }
      if (key.downArrow) { setModeIndex((i) => Math.min(MODE_OPTIONS.length - 1, i + 1)); return; }
      if (key.return) {
        const selected = MODE_OPTIONS[modeIndex];
        if (selected.mode === "oauth") {
          setState((prev) => ({ ...prev, mode: "oauth", step: "key", useOAuth: true, error: undefined }));
          return;
        }
        if (selected.mode === "import") {
          setState((prev) => ({ ...prev, mode: "import", step: "templates", error: undefined }));
          return;
        }
        setState((prev) => ({ ...prev, mode: "raw", step: "name", error: undefined }));
        return;
      }
      return;
    }

    if (state.step === "templates") {
      if (key.upArrow) { setTemplateIndex((i) => Math.max(0, i - 1)); return; }
      if (key.downArrow) { setTemplateIndex((i) => Math.min(state.templates.length - 1, i + 1)); return; }
      if (key.return) {
        const template = state.templates[templateIndex];
        if (!template) return;
        if (!template.supported) {
          setState((prev) => ({
            ...prev,
            error: `"${template.label}" uses an unsupported API format (${template.api}). Use Raw mode with an OpenAI-compatible proxy endpoint instead.`,
          }));
          return;
        }
        setState((prev) => ({
          ...prev,
          selectedTemplate: template,
          name: template.id,
          baseUrl: template.baseUrl,
          adapter: template.adapter ?? "openai-chat",
          scannedModels: template.models.map((id) => ({ id })),
          step: "key-detect",
          error: undefined,
        }));
        return;
      }
      return;
    }

    if (state.step === "key-detect") {
      if (key.upArrow) { setKeyConfirmIndex((i) => Math.max(0, i - 1)); return; }
      if (key.downArrow) { setKeyConfirmIndex((i) => Math.min(1, i + 1)); return; }
      if (key.return) {
        if (state.keyResolveResult?.isOAuth) {
          setState((prev) => ({ ...prev, useOAuth: true, step: "key", error: undefined }));
          return;
        }
        if (state.keyResolveResult?.resolved && keyConfirmIndex === 0) {
          setState((prev) => ({ ...prev, step: "test", testStatus: "idle", scanStatus: "idle", error: undefined }));
          return;
        }
        setState((prev) => ({ ...prev, step: "key", error: undefined }));
        return;
      }
      return;
    }

    if (state.step === "protocol") {
      if (key.upArrow) { setState((prev) => ({ ...prev, protocolIndex: Math.max(0, prev.protocolIndex - 1) })); return; }
      if (key.downArrow) { setState((prev) => ({ ...prev, protocolIndex: Math.min(PROTOCOL_OPTIONS.length - 1, prev.protocolIndex + 1) })); return; }
      if (key.return) {
        const selected = PROTOCOL_OPTIONS[state.protocolIndex];
        setState((prev) => ({ ...prev, adapter: selected.adapter, step: "key", error: undefined }));
        return;
      }
      return;
    }

    if (state.step === "models") {
      // Arrow navigation only in selector mode (modelSourceIndex=0)
      if (state.modelSourceIndex === 0) {
        if (key.upArrow) { setState((prev) => ({ ...prev, modelSourceIndex: Math.max(0, prev.modelSourceIndex - 1) })); return; }
        if (key.downArrow) { setState((prev) => ({ ...prev, modelSourceIndex: Math.min(1, prev.modelSourceIndex + 1) })); return; }
      }
      if (key.return) {
        if (state.modelSourceIndex === 0) {
          // Auto-scan
          setState((prev) => ({ ...prev, step: "test", testStatus: "idle", scanStatus: "idle", error: undefined }));
          return;
        }
        // Manual entry: if draft has content, parse and submit; otherwise enter text mode
        if (draft.length > 0) {
          const models = draft.split(",").map((m) => m.trim()).filter((m) => m.length > 0);
          if (models.length === 0) {
            setState((prev) => ({ ...prev, error: "Enter at least one model name." }));
            return;
          }
          setState((prev) => ({
            ...prev,
            scannedModels: models.map((id) => ({ id })),
            step: "confirm",
            error: undefined,
          }));
          resetDraft();
          return;
        }
        // Empty draft — just enable text input (clear the selector UI)
        return;
      }
      // Text input for manual model entry (when modelSourceIndex=1)
      if (state.modelSourceIndex === 1) {
        if (key.backspace || input === "\b") {
          if (cursor > 0) { setDraft((prev) => prev.slice(0, cursor - 1) + prev.slice(cursor)); setCursor((c) => c - 1); }
          return;
        }
        if (key.delete) {
          if (cursor < draft.length) { setDraft((prev) => prev.slice(0, cursor) + prev.slice(cursor + 1)); }
          return;
        }
        if (key.leftArrow && cursor > 0) { setCursor((c) => c - 1); return; }
        if (key.rightArrow && cursor < draft.length) { setCursor((c) => c + 1); return; }
        if (input && input.length === 1 && input.charCodeAt(0) >= 32) {
          setDraft((prev) => prev.slice(0, cursor) + input + prev.slice(cursor));
          setCursor((c) => c + 1);
        }
      }
      return;
    }

    if (state.step === "test") {
      if (state.testStatus === "error" && key.return) {
        const prevStep = state.mode === "import" ? "key-detect" : "key";
        setState((prev) => ({ ...prev, step: prevStep as WizardStep, testStatus: "idle", scanStatus: "idle" }));
      }
      if (state.testStatus === "success" && key.return) {
        setState((prev) => ({ ...prev, step: "confirm" }));
      }
      return;
    }

    if (state.step === "confirm") {
      if (key.return) {
        const defaultModel = state.manualModel.trim() || state.scannedModels[0]?.id || "";
        onComplete({
          name: state.name,
          baseUrl: state.baseUrl,
          apiKey: state.apiKey || undefined,
          adapter: state.adapter,
          defaultModel: defaultModel || undefined,
          scannedModels: state.scannedModels,
        });
      }
      return;
    }

    if (key.return) { commitDraft(); return; }
    if (key.backspace || input === "\b") {
      if (cursor > 0) { setDraft((prev) => prev.slice(0, cursor - 1) + prev.slice(cursor)); setCursor((c) => c - 1); }
      return;
    }
    if (key.delete) {
      if (cursor < draft.length) { setDraft((prev) => prev.slice(0, cursor) + prev.slice(cursor + 1)); }
      return;
    }
    if (key.leftArrow && cursor > 0) { setCursor((c) => c - 1); return; }
    if (key.rightArrow && cursor < draft.length) { setCursor((c) => c + 1); return; }
    if (state.step === "key" && key.tab && !key.shift) {
      setState((prev) => ({ ...prev, keyVisible: !prev.keyVisible }));
      return;
    }
    if (input && input.length === 1 && input.charCodeAt(0) >= 32) {
      setDraft((prev) => prev.slice(0, cursor) + input + prev.slice(cursor));
      setCursor((c) => c + 1);
    }
  });

  function commitDraft(): void {
    if (state.step === "name") {
      const result = validateProviderName(draft, existingNames);
      if (!result.ok) { setState((prev) => ({ ...prev, error: result.error })); return; }
      setState((prev) => ({ ...prev, name: draft.trim(), step: "url", error: undefined }));
      resetDraft();
      return;
    }
    if (state.step === "url") {
      const result = validateBaseUrl(draft);
      if (!result.ok) { setState((prev) => ({ ...prev, error: result.error })); return; }
      setState((prev) => ({ ...prev, baseUrl: draft.trim(), step: "protocol", error: undefined }));
      resetDraft();
      return;
    }
    if (state.step === "key") {
      setState((prev) => ({
        ...prev,
        apiKey: draft,
        step: state.mode === "raw" ? "models" : "test", // oauth+import → test; raw → models
        testStatus: "idle",
        scanStatus: "idle",
        error: undefined,
      }));
      resetDraft();
      return;
    }
    if (state.step === "confirm") {
      setState((prev) => ({ ...prev, manualModel: draft.trim() }));
    }
  }

  function goBack(): void {
    const importOrder: WizardStep[] = ["mode", "templates", "key-detect", "key", "test", "confirm"];
    const rawOrder: WizardStep[] = ["mode", "name", "url", "protocol", "key", "models", "test", "confirm"];
    const order = state.mode === "import" ? importOrder : rawOrder;
    const idx = order.indexOf(state.step);
    if (idx <= 0) { onCancel(); return; }
    const prevStep = order[idx - 1];
    setState((prev) => ({
      ...prev,
      step: prevStep,
      testStatus: prevStep === "test" ? "idle" : prev.testStatus,
      scanStatus: prevStep === "test" ? "idle" : prev.scanStatus,
      error: undefined,
    }));
    // Restore draft for text-entry steps
    if (prevStep === "name") { setDraft(state.name); setCursor(state.name.length); }
    else if (prevStep === "url") { setDraft(state.baseUrl); setCursor(state.baseUrl.length); }
    else if (prevStep === "key") { setDraft(state.apiKey); setCursor(state.apiKey.length); }
  }
  const title = `/provider add — ${stepTitle(state.step)}`;

  return (
    <Frame title={title}>
      <Box flexDirection="column">
        {state.step === "mode" ? renderModeSelector(modeIndex) : null}
        {state.step === "templates" ? renderTemplateList(state, templateIndex) : null}
        {state.step === "key-detect" ? renderKeyDetectStep(state, keyConfirmIndex) : null}
        {state.step === "name" ? renderTextInput("Enter a name for this provider", 'e.g. "groq", "together", "ollama"', draft, cursor) : null}
        {state.step === "url" ? renderTextInput("Enter the provider base URL", "e.g. https://api.groq.com/openai/v1", draft, cursor) : null}
        {state.step === "protocol" ? renderProtocolSelector(state.protocolIndex) : null}
        {state.step === "key" ? renderKeyStep(state, draft, cursor) : null}
        {state.step === "models" ? renderModelSourceSelector(state, draft, cursor) : null}
        {state.step === "test" ? renderTestStep(state) : null}
        {state.step === "confirm" ? renderConfirmStep(state, draft, cursor) : null}
        {state.error ? (
          <Box marginTop={1}><Text color="red">{"✗ "}{state.error}</Text></Box>
        ) : null}
        <Box marginTop={1}>
          <Text color="gray">{"[↑↓] navigate  [Enter] select  [Esc] back  [Ctrl+C] cancel"}</Text>
        </Box>
      </Box>
    </Frame>
  );
}

function renderModeSelector(selectedIndex: number) {
  return (
    <Box flexDirection="column">
      <Text color="cyan">{"How would you like to set up?"}</Text>
      <Box flexDirection="column" marginTop={1}>
        {MODE_OPTIONS.map((opt, i) => (
          <Box key={opt.mode}>
            <Text color={i === selectedIndex ? "green" : "gray"}>{i === selectedIndex ? "▸ " : "  "}</Text>
            <Text color={i === selectedIndex ? "white" : "gray"} bold={i === selectedIndex}>{opt.label}</Text>
            <Text color="gray">{` — ${opt.description}`}</Text>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

function renderTemplateList(state: WizardState, selectedIndex: number) {
  if (state.templates.length === 0) {
    return (
      <Box flexDirection="column">
        <Text color="yellow">{"No provider templates found in ~/.anima/providers.d/"}</Text>
        <Text color="gray">{"Press [Esc] to go back and try Raw mode instead."}</Text>
      </Box>
    );
  }
  return (
    <Box flexDirection="column">
      <Text color="cyan">{`Select Provider Template (${state.templates.length} found)`}</Text>
      <Box flexDirection="column" marginTop={1}>
        {state.templates.map((t, i) => {
          const icon = keyStatusIcon(t);
          const host = t.baseUrl.replace(/^https?:\/\//, "").split("/")[0];
          return (
            <Box key={t.id}>
              <Text color={i === selectedIndex ? "green" : "gray"}>{i === selectedIndex ? "▸ " : "  "}</Text>
              <Text color={i === selectedIndex ? "white" : "gray"} bold={i === selectedIndex}>{t.label.padEnd(22)}</Text>
              <Text>{` ${icon} `}</Text>
              <Text color="gray">{`${(t.adapter ?? t.api).padEnd(12)} ${host}`}</Text>
            </Box>
          );
        })}
      </Box>
      <Box marginTop={1}>
        <Text color="gray">{"✅ found  ⚠️ missing  🔑 OAuth  ⛔ unsupported"}</Text>
      </Box>
    </Box>
  );
}

function renderKeyDetectStep(state: WizardState, selectedIndex: number) {
  const result = state.keyResolveResult;
  const template = state.selectedTemplate;
  if (!template || !result) return <Text color="yellow">{"Resolving API key…"}</Text>;

  if (result.isOAuth) {
    return (
      <Box flexDirection="column">
        <Text color="cyan">{`Sign In — ${template.label}`}</Text>
        <Text color="gray">{"This provider requires OAuth login."}</Text>
        <Box flexDirection="column" marginTop={1}>
          <Box>
            <Text color={selectedIndex === 0 ? "green" : "gray"}>{selectedIndex === 0 ? "▸ " : "  "}</Text>
            <Text color={selectedIndex === 0 ? "white" : "gray"} bold={selectedIndex === 0}>{"Open browser to sign in"}</Text>
          </Box>
          <Box>
            <Text color={selectedIndex === 1 ? "green" : "gray"}>{selectedIndex === 1 ? "▸ " : "  "}</Text>
            <Text color={selectedIndex === 1 ? "white" : "gray"} bold={selectedIndex === 1}>{"Enter API key manually instead"}</Text>
          </Box>
        </Box>
      </Box>
    );
  }

  if (result.resolved && result.value) {
    return (
      <Box flexDirection="column">
        <Text color="cyan">{`API Key — ${template.label}`}</Text>
        <Text color="gray">{`Found in ${result.source}: ${maskApiKey(result.value)}`}</Text>
        <Box flexDirection="column" marginTop={1}>
          <Box>
            <Text color={selectedIndex === 0 ? "green" : "gray"}>{selectedIndex === 0 ? "▸ " : "  "}</Text>
            <Text color={selectedIndex === 0 ? "white" : "gray"} bold={selectedIndex === 0}>{"Use this key"}</Text>
          </Box>
          <Box>
            <Text color={selectedIndex === 1 ? "green" : "gray"}>{selectedIndex === 1 ? "▸ " : "  "}</Text>
            <Text color={selectedIndex === 1 ? "white" : "gray"} bold={selectedIndex === 1}>{"Enter different key"}</Text>
          </Box>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text color="cyan">{`API Key — ${template.label}`}</Text>
      <Text color="yellow">{`No key found for ${template.apiKeyRef}`}</Text>
      <Text color="gray">{"Press [Enter] to enter key manually."}</Text>
    </Box>
  );
}

function renderProtocolSelector(selectedIndex: number) {
  return (
    <Box flexDirection="column">
      <Text color="cyan">{"Select API Protocol"}</Text>
      <Box flexDirection="column" marginTop={1}>
        {PROTOCOL_OPTIONS.map((opt, i) => (
          <Box key={opt.adapter}>
            <Text color={i === selectedIndex ? "green" : "gray"}>{i === selectedIndex ? "▸ " : "  "}</Text>
            <Text color={i === selectedIndex ? "white" : "gray"} bold={i === selectedIndex}>{opt.label}</Text>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

function renderModelSourceSelector(state: WizardState, draft: string, cursor: number) {
  if (state.modelSourceIndex === 1) {
    return (
      <Box flexDirection="column">
        <Text color="cyan">{"Enter model names, separated by commas"}</Text>
        {state.selectedTemplate?.models.length ? (
          <Text color="gray">{`Popular: ${state.selectedTemplate.models.slice(0, 3).join(", ")}`}</Text>
        ) : null}
        <Box marginTop={1}>
          <Text color="green">{"▸ "}</Text>
          <Text>{draft.slice(0, cursor)}</Text>
          <Text inverse>{" "}</Text>
          <Text>{draft.slice(cursor)}</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text color="cyan">{"How to configure models?"}</Text>
      <Box flexDirection="column" marginTop={1}>
        {MODEL_SOURCE_OPTIONS.map((opt, i) => (
          <Box key={opt.value}>
            <Text color={i === state.modelSourceIndex ? "green" : "gray"}>{i === state.modelSourceIndex ? "▸ " : "  "}</Text>
            <Text color={i === state.modelSourceIndex ? "white" : "gray"} bold={i === state.modelSourceIndex}>{opt.label}</Text>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

function renderTextInput(label: string, hint: string, draft: string, cursor: number) {
  return (
    <Box flexDirection="column">
      <Text color="cyan">{label}</Text>
      <Text color="gray">{hint}</Text>
      <Box marginTop={1}>
        <Text color="green">{"▸ "}</Text>
        <Text>{draft.slice(0, cursor)}</Text>
        <Text inverse>{" "}</Text>
        <Text>{draft.slice(cursor)}</Text>
      </Box>
    </Box>
  );
}

function renderKeyStep(state: WizardState, draft: string, cursor: number) {
  const shown = state.keyVisible ? draft : maskApiKey(draft);
  const shownCursor = state.keyVisible ? cursor : shown.length;
  return (
    <Box flexDirection="column">
      <Text color="cyan">{"Enter the API key (masked)"}</Text>
      <Text color="gray">{"[Tab] toggle show/hide"}</Text>
      {state.useOAuth ? (
        <Box marginTop={0}>
          <Text color="yellow">{"OAuth: coming soon — please enter an API key for now."}</Text>
        </Box>
      ) : null}
      <Box marginTop={1}>
        <Text color="green">{"▸ "}</Text>
        <Text>{shown.slice(0, shownCursor)}</Text>
        <Text inverse>{" "}</Text>
        <Text>{shown.slice(shownCursor)}</Text>
      </Box>
    </Box>
  );
}

function renderTestStep(state: WizardState) {
  return (
    <Box flexDirection="column">
      <Text color="cyan">{"Testing connection & scanning models…"}</Text>
      <Box marginTop={1}>
        {state.testStatus === "testing" ? <Text color="yellow">{"  ⠋ testing connectivity…"}</Text> : null}
        {state.testStatus === "success" ? <Text color="green">{"  ✓ connection ok"}</Text> : null}
        {state.testStatus === "error" ? <Text color="red">{"  ✗ connection failed — press Enter to edit the key/url"}</Text> : null}
      </Box>
      {state.scanStatus === "scanning" ? <Text color="yellow">{"  ⠋ scanning models…"}</Text> : null}
      {state.scanStatus === "success" ? (
        <Box flexDirection="column" marginTop={0}>
          <Text color="green">{`  ✓ ${state.scannedModels.length} model(s) discovered:`}</Text>
          {formatScannedModels(state.scannedModels).map((line, i) => (
            <Text key={`scan-${i}`} color="gray">{line}</Text>
          ))}
        </Box>
      ) : null}
      {state.scanStatus === "error" ? <Text color="yellow">{"  ! model scan failed — you may continue and enter a model manually"}</Text> : null}
      {state.testStatus === "success" ? (
        <Box marginTop={1}><Text color="green" bold>{"[Enter] continue to confirm"}</Text></Box>
      ) : null}
    </Box>
  );
}

function renderConfirmStep(state: WizardState, draft: string, cursor: number) {
  const keyDisplay = state.apiKey ? maskApiKey(state.apiKey) : "(none)";
  return (
    <Box flexDirection="column">
      <Text color="cyan">{"Review and confirm"}</Text>
      <Box flexDirection="column" marginTop={1}>
        <Text><Text color="gray">{"Name:     "}</Text><Text color="white" bold>{state.name}</Text></Text>
        <Text><Text color="gray">{"Base URL: "}</Text><Text color="white" bold>{state.baseUrl}</Text></Text>
        <Text><Text color="gray">{"API Key:  "}</Text><Text color="white" bold>{keyDisplay}</Text></Text>
        <Text><Text color="gray">{"Adapter:  "}</Text><Text color="white" bold>{state.adapter}</Text></Text>
        <Text><Text color="gray">{"Models:   "}</Text><Text color="white" bold>{String(state.scannedModels.length)}</Text></Text>
      </Box>
      {state.scannedModels.length === 0 ? (
        <Box marginTop={1} flexDirection="column">
          <Text color="gray">{"Default model (optional — pick from scan or type a custom one):"}</Text>
          <Box>
            <Text color="green">{"▸ "}</Text>
            <Text>{draft.slice(0, cursor)}</Text>
            <Text inverse>{" "}</Text>
            <Text>{draft.slice(cursor)}</Text>
          </Box>
        </Box>
      ) : null}
      <Box marginTop={1}>
        <Text color="green" bold>{"[Enter] save & register"}</Text>
      </Box>
    </Box>
  );
}
