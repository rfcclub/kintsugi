# Tasks: Phase 10 - Model Configuration And Live Smoke

## Config Resolution

- [x] T1: Add tests proving model profiles resolve provider, model, provider settings, model config, and key file.
- [x] T2: Add tests proving key-file auth creates real providers without inline API keys.
- [x] T3: Add `config doctor` coverage for missing key file and missing API key on real providers.

## Provider Serialization

- [x] T4: Add OpenAI Chat fake-fetch test for model config body serialization.
- [x] T5: Add OpenAI Responses fake-fetch test for model config body serialization.
- [x] T6: Add Anthropic Messages fake-fetch test for model config body serialization.
- [x] T7: Add tests proving per-turn `modelConfig` overrides provider defaults.

## Live Smoke

- [x] T8: Add opt-in `tests/live-provider-smoke.test.ts` gated by `KINTSUGI_LIVE_SMOKE=1`.
- [x] T9: Live smoke resolves provider/model/key through normal config path.
- [x] T10: Live smoke asserts non-empty assistant completion and no key leakage.
- [x] T11: Document exact live smoke command with key-file preference.

## Verification

- [x] T12: `npm run build` succeeds.
- [x] T13: `npm test` passes without live credentials.
- [x] T14: `openspec validate phase-10-model-configuration-live-smoke --strict` passes.
- [x] T15: Optional live smoke command is documented and can be run manually when keys exist.

---

*Tasks: Kintsugi - 2026-05-24*
