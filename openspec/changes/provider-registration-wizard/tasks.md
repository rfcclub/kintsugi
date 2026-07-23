# Implementation Plan: provider-registration-wizard

## Preparation

- [x] Review spec scenarios for provider-registration-wizard
- [x] Review design.md test strategy

## Tasks

### Task 1: Add `/provider` slash command + status overlay

**Files:**
- Modify: `src/ui/commands/slash.ts` (add `provider` to SlashCommandName + COMMANDS set)
- Modify: `src/ui/views/TuiView.tsx` (add `handleSlash` case for `provider`)

**Steps:**
- [x] **Step 1:** Add `provider` to `SlashCommandName` type union and `COMMANDS` set
- [x] **Step 2:** Implement `/provider` (no args) handler -> show status overlay (provider, model, baseUrl, connected status)
- [x] **Step 3:** Implement `/provider add` handler -> set state to show ProviderWizard
- [x] **Step 4:** Run tests + lint

### Task 2: Build ModelCache and ProviderScanner modules

**Files:**
- CREATE: `src/providers/scanner.ts`
- CREATE: `src/providers/cache.ts`
- CREATE: `tests/provider-scanner.test.ts`
- CREATE: `tests/provider-cache.test.ts`

**Steps:**
- [x] **Step 1:** Write failing tests for scanner (testConnection success, testConnection timeout, scanModels parse)
- [x] **Step 2:** Implement `src/providers/scanner.ts` with fetch + timeout
- [x] **Step 3:** Write failing tests for cache (readCache, writeCache, missing file, getModels)
- [x] **Step 4:** Implement `src/providers/cache.ts`
- [x] **Step 5:** Run tests + lint

### Task 3: Build ProviderWizard component

**Files:**
- CREATE: `src/ui/components/ProviderWizard.tsx`
- CREATE: `tests/ui/provider-wizard.test.ts`

**Steps:**
- [x] **Step 1:** Write failing tests for wizard step transitions (pure helpers: validateProviderName, validateBaseUrl, maskApiKey, formatScannedModels, stepIndex/stepTitle)
- [x] **Step 2:** Implement ProviderWizard with 5-step state machine
- [x] **Step 3:** Implement NameStep (text input, validate non-empty, no duplicate)
- [x] **Step 4:** Implement UrlStep (text input, validate URL format)
- [x] **Step 5:** Implement KeyStep (masked input, toggle show/hide, OAuth placeholder)
- [x] **Step 6:** Implement TestStep (call scanner, show spinner, display results)
- [x] **Step 7:** Implement ConfirmStep (summary, save button)
- [x] **Step 8:** Run tests + lint

### Task 4: Integrate with config writer + Picker

**Files:**
- Modify: `src/config/config.ts` (add `addProviderToConfig`)
- Modify: `src/ui/components/Picker.tsx` (dynamic providers from config)
- Modify: `src/providers/registry.ts` (create provider from custom config)
- Modify: `src/providers/config.ts` (support custom presets)
- Modify: `src/index.tsx` (load model cache on startup)

**Steps:**
- [x] **Step 1:** Implement `addProviderToConfig` in config.ts (read YAML, add entry, backup, write) - plus `setProviderDefaultModel`, `listRegisteredProviders`, `isProviderRegistered`. API keys persisted to `~/.config/kintsugi/keys/{name}.key` (mode 0600), referenced via `keyFile` (secrets never stored in config.yaml).
- [ ] **Step 2:** Modify Picker to load providers from config + append "Add new provider" entry -> open wizard
- [x] **Step 3:** Connect ProviderWizard `onComplete` -> save config + update cache (wired in TuiView.handleWizardComplete)
- [ ] **Step 4:** Update registry to support dynamic provider creation (custom presets already resolve through existing `resolveModelSelection` + `providerPresets`; explicit registry hook deferred)
- [x] **Step 5:** Run tests + lint

> **Note on Steps 2 & 4:** Custom providers registered via the wizard become `providerPresets` entries (adapter + baseUrl + keyFile + defaultModel), which already resolve through the existing `resolveModelSelection` flow. The boot-time `Picker` currently hardcodes the four adapter types; surfacing custom presets there (and the "Add new provider..." entry) is deferred as a follow-up to avoid destabilizing the boot picker. `/provider add` (wizard) and `/model list` / `/model use` cover the in-session registration and selection flows.

### Task 5: `/model` integration with model cache

**Files:**
- Modify: `src/ui/views/TuiView.tsx` (add `/model list` + `/model use` handlers that read model-cache.json)
- Modify: `tests/slash-extended.test.ts` (add `/model list`/`use` parse tests)

**Steps:**
- [x] **Step 1:** Implement `/model list` in TuiView handler - load models from cache for current provider (or all cached providers when none specified)
- [x] **Step 2:** Render numbered model list overlay with owner hints
- [x] **Step 3:** On model selection (`/model use <id>`), set active model in runtime (in-memory switch via `resolveModelSelection` override)
- [x] **Step 4:** Handle edge case: no cache file, empty cache, provider not found in cache
- [x] **Step 5:** Run tests + lint

### Task 6: End-to-end integration + polish

**Files:**
- Modify: `src/ui/views/TuiView.tsx` (full `/provider` integration)
- Modify: `.gitignore` (model-cache.json + key files)

**Steps:**
- [x] **Step 1:** Wire everything together in TuiView (wizard onComplete -> addProviderToConfig + writeProviderCache + status)
- [x] **Step 2:** Ensure provider appears in `/model list` after registration (cache + preset persisted)
- [x] **Step 3:** Test full flow: `/provider add` -> wizard -> save -> `/model list`
- [x] **Step 4:** Run full test suite + lint + coverage
- [x] **Step 5:** Update `.traceability.yaml` + spec traceability paths

## Verification

- [x] `/provider` hien thi trang thai provider hien tai
- [x] `/provider add` mo wizard du 5 buoc
- [~] Test ket noi thanh cong voi Groq, Together AI, Ollama (scanner unit-tested with mocked fetch; live test deferred)
- [x] Model scan hoat dong, cache duoc ghi
- [x] Config YAML duoc cap nhat (providerPresets) + key file persisted
- [ ] Provider moi xuat hien trong picker (Picker dynamic extension deferred - see Task 4 note)
- [x] `/model list` hien thi danh sach models tu cache
- [x] Chon model (`/model use <id>`) -> set active (in-memory); config persistence via `setProviderDefaultModel`
- [x] `/model` (no args) van hien thi profiles nhu cu
- [x] All tests passing (existing + new): 729 passing, 2 skipped
- [x] No lint errors (`tsc --noEmit`)
- [x] `.traceability.yaml` updated
