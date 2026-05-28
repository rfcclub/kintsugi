# Proposal: Phase 11 - Provider Model Profile UX

## Why

Phase 10 made provider/model configuration real enough for live smoke, but the interactive UX still treats provider selection as low-level adapter plumbing. users can have many providers and model gateways; Kintsugi should expose named profiles such as `example-kimi` rather than making users remember adapter names, base URLs, key files, and model IDs.

## What Changes

- Add model-profile UX helpers for listing configured profiles, inspecting the active selection, and redacting key sources.
- Make `/model <profile>` resolve the actual configured profile provider, model, provider settings, and model config.
- Add `/model` overlay output and `/model inspect` output in the TUI.
- Show the active provider/model profile in the TUI status area.
- Add tests for profile resolution, profile list state, inspect redaction, and missing-profile errors.

## Impact

- Completes the Phase 8 `/model` overlay gap.
- Builds on archived Phase 10 model configuration specs.
- Does not add new provider adapters.
