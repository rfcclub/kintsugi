# Tasks: Phase 12 - Provider Conformance And Presets

## OpenSpec

- [x] T1: Create proposal, design, tasks, and spec delta.
- [x] T2: Validate `phase-12-provider-conformance-presets --strict`.

## Provider Presets

- [x] T3: Add provider preset config types and YAML parsing.
- [x] T4: Add built-in presets for `openai`, `openai-responses`, `anthropic`, `example`, and `openai-compatible`.
- [x] T5: Resolve `modelProfiles.<name>.preset` into concrete adapter/provider settings.
- [x] T6: Ensure CLI/env/top-level overrides preserve current precedence.
- [x] T7: Add tests for preset override and unknown preset failures.

## Provider Diagnostics

- [x] T8: Extend `config doctor` with provider readiness states.
- [x] T9: Detect unreadable key files without printing key contents.
- [x] T10: Detect base URLs that include completion endpoint paths instead of API roots.
- [x] T11: Show concrete adapter, preset, model, key source, and base URL in `/doctor` and `/model inspect`.
- [x] T12: Add tests for redacted diagnostics and endpoint-shape warnings.

## Conformance Harness

- [x] T13: Create provider conformance helpers shared by local and live tests.
- [x] T14: Add fake-server streaming conformance for OpenAI Chat.
- [x] T15: Add fake-server streaming conformance for OpenAI Responses.
- [x] T16: Add fake-server streaming conformance for Anthropic Messages.
- [x] T17: Add tool-call continuation conformance using `read_file`.
- [x] T18: Add cancellation conformance for in-flight provider requests.
- [x] T19: Add key redaction conformance for provider errors.
- [x] T20: Add base URL normalization conformance for trailing slashes.

## Live Matrix

- [x] T21: Add `npm run test:providers` for local conformance.
- [x] T22: Add opt-in live profile matrix gated by `KINTSUGI_LIVE_SMOKE=1`.
- [x] T23: Add `KINTSUGI_LIVE_PROFILES` selection.
- [x] T24: Make live tool-call conformance capability-aware.
- [x] T25: Ensure live smoke output never prints API keys or key-file contents.

## Docs

- [x] T26: Add provider onboarding guide for Example and generic OpenAI-compatible endpoints.
- [x] T27: Document correct base URL shape: API root only, not `/chat/completions`.
- [x] T28: Document preset/profile examples and live matrix commands.

## Verification

- [x] T29: `npm run build` succeeds.
- [x] T30: `npm test` passes.
- [x] T31: `npm run test:providers` passes without live network.
- [x] T32: `npx openspec validate --all --strict` passes.

---

*Tasks: Kintsugi - 2026-05-26*
