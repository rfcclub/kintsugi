# Provider Onboarding (Import + Raw + OAuth) — Tasks

## Phase 1: Template Scanner Module

### Task 1.1: Create parseTemplateFile() function
- **File**: `src/providers/template-scanner.ts`
- **Change**: Parse single YAML file from providers.d format into ProviderTemplate
- **Test**: `tests/template-scanner.test.ts`
  - Parse valid template (nahcrof.yaml) → correct fields
  - Handle missing required fields (id, label, api, baseUrl) → return null
  - Handle malformed YAML → return null + warning
  - Parse models array correctly
  - Handle empty models array

### Task 1.2: Create scanTemplates() function
- **File**: `src/providers/template-scanner.ts`
- **Change**: Scan ~/.anima/providers.d/*.yaml, return ProviderTemplate[]
- **Test**: `tests/template-scanner.test.ts`
  - Scan directory with multiple .yaml files → array of templates
  - Handle missing directory → empty array
  - Handle empty directory → empty array
  - Skip non-.yaml files
  - Skip malformed files silently

### Task 1.3: Create mapApiToAdapter() function
- **File**: `src/providers/template-scanner.ts`
- **Change**: Map providers.d api field to kintsugi adapter type. Return `null` for unsupported adapters.
- **Test**: `tests/template-scanner.test.ts`
  - "openai-completions" → "openai-chat"
  - "anthropic-messages" → "anthropic-messages"
  - "generic" → `null` (unsupported — not OpenAI/Anthropic compatible)
  - unknown → `null` (unsupported)

### Task 1.4: Create ProviderTemplate interface
- **File**: `src/providers/template-scanner.ts`
- **Change**: Define ProviderTemplate, ScanTemplatesOptions types
- **Test**: Type check passes

---

## Phase 2: Env Resolver Module

### Task 2.1: Create parseAnimaEnv() function
- **File**: `src/providers/env-resolver.ts`
- **Change**: Parse ~/.anima/anima.env, extract KEY=VALUE pairs
- **Test**: `tests/env-resolver.test.ts`
  - Parse standard KEY=VALUE → correct map
  - Handle values with special characters
  - Skip comment lines (# ...)
  - Skip empty lines
  - Handle missing file → empty map

### Task 2.2: Create parseZshrc() function
- **File**: `src/providers/env-resolver.ts`
- **Change**: Parse ~/.zshrc, extract export KEY=VALUE pairs
- **Test**: `tests/env-resolver.test.ts`
  - Parse `export KEY=value` → correct
  - Handle `export KEY="quoted"` → strip quotes
  - Handle `export KEY='single'` → strip quotes
  - Handle inline comments: `export KEY=val # comment` → `val`
  - Skip non-export lines (aliases, functions, comments)
  - Handle missing file → empty map

### Task 2.3: Create resolveEnvVar() function
- **File**: `src/providers/env-resolver.ts`
- **Change**: Resolve env var from process.env → anima.env → .zshrc
- **Test**: `tests/env-resolver.test.ts`
  - Key in process.env → found, source="env"
  - Key in anima.env only → found, source="anima-env"
  - Key in .zshrc only → found, source="zshrc"
  - Key in multiple → prefers process.env
  - Key not found → null

### Task 2.4: Create resolveApiKeyRef() function
- **File**: `src/providers/env-resolver.ts`
- **Change**: Resolve apiKey reference patterns from providers.d
- **Test**: `tests/env-resolver.test.ts`
  - `${ENV_VAR}` → resolveEnvVar result
  - `${ENV_VAR:-default}` → resolveEnvVar or default
  - `${OAUTH:provider}` → isOAuth=true
  - literal key → direct value
  - empty ref → resolved=false

---

## Phase 3: Wizard Mode Selector

### Task 3.1: Add mode selector step
- **File**: `src/ui/components/ProviderWizard.tsx`
- **Change**: Add "mode" as first step with 3 options: import / raw / oauth
- **Test**: `tests/ui/provider-wizard.test.ts`
  - Renders 3 mode options
  - Default is "import"
  - Selecting "import" → template list
  - Selecting "raw" → name input
  - Selecting "oauth" → oauth prompt

---

## Phase 4: Import Mode

### Task 4.1: Add template list step
- **File**: `src/ui/components/ProviderWizard.tsx`
- **Change**: Display scanned templates with key status indicators (✅/⚠️/🔑/⛔)
- **Test**: `tests/ui/provider-wizard.test.ts`
  - Renders template list from scanTemplates()
  - Shows label, api, baseUrl per template
  - Shows ✅/⚠️/🔑/⛔ key status indicators
  - ⛔ shown for unsupported adapters (generic, unknown)
  - Arrow key navigation
  - Selecting template → auto-fill state

### Task 4.2: Add key confirmation step (import mode)
- **File**: `src/ui/components/ProviderWizard.tsx`
- **Test**: `tests/ui/provider-wizard.test.ts`
  - Key found → shows masked key, asks confirm
  - Key missing → shows manual input
  - OAuth → shows OAuth prompt
  - Unsupported adapter (⛔) → shows error message, returns to list
  - User confirms key → proceeds
  - User rejects key → manual input

### Task 4.3: Add OAuth prompt step
- **File**: `src/ui/components/ProviderWizard.tsx`
- **Change**: Show OAuth login options (browser / manual fallback)
- **Test**: `tests/ui/provider-wizard.test.ts`
  - Shows "Login with [Provider]"
  - Shows "Open browser" option
  - Shows "Enter key manually" option
  - Browser option → "coming soon" message
  - Manual option → key input

---

## Phase 5: Raw Mode Enhancement

### Task 5.1: Add protocol selector step
- **File**: `src/ui/components/ProviderWizard.tsx`
- **Change**: Protocol selection with 3 options
- **Test**: `tests/ui/provider-wizard.test.ts`
  - Renders 3 protocol options
  - Default is "OpenAI Chat"
  - Maps to adapter string

### Task 5.2: Add model source selection + manual entry
- **File**: `src/ui/components/ProviderWizard.tsx`
- **Change**: Auto-scan / manual entry with comma-separated parsing
- **Test**: `tests/ui/provider-wizard.test.ts`
  - Auto-scan triggers scanModels()
  - Manual entry parses comma-separated input
  - Scan failure offers manual fallback

---

## Phase 6: Integration & Wiring

### Task 6.1: Wire import mode to config writer
- **File**: `src/ui/views/TuiView.tsx`
- **Change**: handleWizardComplete for import mode uses template data
- **Test**: `tests/provider-config-writer.test.ts`
  - Import saves correct adapter/baseUrl/key/models

### Task 6.2: Wire raw mode to config writer
- **File**: `src/ui/views/TuiView.tsx`
- **Change**: handleWizardComplete for raw mode uses manual data
- **Test**: `tests/provider-config-writer.test.ts`
  - Raw saves all manually entered fields

### Task 6.3: Backward compatibility
- **File**: `src/ui/components/ProviderWizard.tsx`
- **Change**: Ensure existing wizard tests still pass
- **Test**: `tests/ui/provider-wizard.test.ts`
  - All existing tests pass
  - Wizard works without explicit mode (defaults to import)

---

## Phase 7: Polish

### Task 7.1: Export new types and helpers
- **File**: `src/providers/template-scanner.ts`, `src/providers/env-resolver.ts`
- **Change**: Export interfaces, parse functions, resolve functions
- **Test**: Type check passes

### Task 7.2: Run full test suite
- **Command**: `npm test`
- **Acceptance**: All tests pass, no regressions

### Task 7.3: Run lint
- **Command**: `npm run lint`
- **Acceptance**: No TypeScript errors

### Task 7.4: LoomKit verify
- **Command**: `loomkit verify provider-onboarding-preset-raw`
- **Acceptance**: Coverage gate passes
