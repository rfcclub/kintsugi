# Proposal: Phase 12 - Provider Conformance And Presets

## Why

Kintsugi now has real provider adapters, model profiles, key-file auth, tool execution, cancellation, and opt-in live smokes. The next risk is not missing plumbing; it is provider drift. user uses multiple OpenAI-compatible gateways and models, and a provider can appear "configured" while still failing at runtime because of endpoint shape, model/tool support, streaming format, key source, or unclear diagnostics.

Phase 12 turns provider setup into a conformance layer: named presets, deterministic local conformance tests, opt-in live matrix checks, and doctor output that explains what is wrong before a long debugging session starts.

## What Changes

1. Add provider presets that expand friendly names into adapter/base URL/key/model defaults without hiding the final resolved adapter.
2. Add provider conformance checks for streaming, tool calls, cancellation, key-file auth, redaction, and endpoint path handling.
3. Add a live smoke matrix that can run one or more configured profiles without affecting normal `npm test`.
4. Upgrade `config doctor` and `/doctor` diagnostics for endpoint, key, model, and provider preset readiness.
5. Document a repeatable provider onboarding flow for Example and generic OpenAI-compatible endpoints.

## Goals

- Make common providers/gateways easy to configure without memorizing YAML fragments.
- Keep adapters explicit: presets resolve into existing provider adapters rather than becoming a hidden fourth adapter type.
- Detect common misconfigurations: missing key, missing model, wrong base URL shape, unsupported tool calls, and leaking provider errors.
- Preserve the current safety boundary: no live network calls in default tests, no secrets in committed files, no API keys in logs.

## Non-Goals

- No remote model recommendation system.
- No mandatory live API checks in CI or `npm test`.
- No provider SDK dependency.
- No automatic secret discovery outside explicit env/config/key-file inputs.
- No support for non-streaming provider mode unless required by a conformance finding.

## Affected Capabilities

- Config loading and model profile resolution.
- Provider registry and provider option creation.
- Config doctor and `/doctor` overlay output.
- Live smoke scripts/tests.
- Provider setup docs.

---

*Proposal: Kintsugi - 2026-05-26*
