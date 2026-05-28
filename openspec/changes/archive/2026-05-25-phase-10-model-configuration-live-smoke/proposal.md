# Proposal: Phase 10 - Model Configuration And Live Smoke

## Motivation

Phase 9 proves Kintsugi memory migration behavior, but it still uses mock/fake providers for default verification. That is correct for local tests, but it does not prove real model configuration works end to end.

kintsugi needs a hardened model configuration contract before claiming Kintsugi is ready for real-provider usage: profiles, key files, provider settings, model config fields, and opt-in live smokes must all be explicit.

## Goals

1. Lock model profile resolution into provider options with tests.
2. Prove key-file auth is read without putting secrets in command lines.
3. Prove OpenAI Chat, OpenAI Responses, and Anthropic adapters serialize model config fields into request bodies.
4. Add an opt-in live smoke gate that never runs by default.
5. Make `config doctor` and docs tell the user what is missing before live runs.

## Non-Goals

- No mandatory live API calls in normal `npm test`.
- No provider-specific SDK dependency.
- No automatic model recommendation or remote model discovery.
- No secrets in committed config, tests, logs, or command examples.

## Approach

Use fake-fetch adapter tests for deterministic coverage and a gated live smoke for real-provider confirmation:

- Normal suite tests request-body serialization with fake fetch.
- Key-file tests use temp files.
- Live smoke runs only when `KINTSUGI_LIVE_SMOKE=1` and a real key is available via `KINTSUGI_API_KEY` or `KINTSUGI_KEY_FILE`.
- Live smoke asserts a non-empty assistant completion and records which provider/model was used.

---

*Proposal: Kintsugi - 2026-05-24*
