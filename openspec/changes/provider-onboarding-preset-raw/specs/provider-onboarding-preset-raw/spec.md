# Provider Onboarding (Import + Raw + OAuth) — Specification

## Purpose

Define requirements for a tri-mode provider onboarding flow: **import mode** (from `~/.anima/providers.d/` templates with env key resolution), **raw mode** (manual configuration), and **OAuth mode** (browser-based login).

## Requirements

### Requirement: Wizard SHALL offer three onboarding modes

When user types `/provider add`, the wizard SHALL display a mode selector.

#### Scenario: Mode selector displayed
- **WHEN** user types `/provider add`
- **THEN** wizard shows three options:
  - "Import from providers.d" — with count of templates found
  - "Custom Setup (Raw)" — manual configuration
  - "OAuth Login" — browser-based sign-in
- **AND** user selects one to proceed

#### Scenario: Default to import mode
- **WHEN** user presses Enter without selecting
- **THEN** wizard defaults to import mode

---

### Requirement: Import mode SHALL scan providers.d templates

The import mode SHALL scan `~/.anima/providers.d/*.yaml` and parse each file as a provider template.

#### Scenario: Scan providers.d directory
- **WHEN** user selects import mode
- **THEN** wizard scans `~/.anima/providers.d/` for `*.yaml` files
- **AND** parses each file into a ProviderTemplate with fields: id, label, api, baseUrl, apiKeyRef, models
- **AND** displays the list sorted by label

#### Scenario: Parse YAML template format
- **WHEN** a YAML file contains:
  ```yaml
  id: nahcrof
  label: "Nahcrof AI"
  api: openai-completions
  baseUrl: https://crof.ai/v1
  apiKey: ${NAHCROF_API_KEY}
  models:
    - id: deepseek-v4-pro
    - id: glm-5.2
  ```
- **THEN** parser extracts:
  - id: "nahcrof"
  - label: "Nahcrof AI"
  - api: "openai-completions"
  - baseUrl: "https://crof.ai/v1"
  - apiKeyRef: "${NAHCROF_API_KEY}"
  - models: ["deepseek-v4-pro", "glm-5.2"]

#### Scenario: Handle missing providers.d directory
- **WHEN** `~/.anima/providers.d/` does not exist
- **THEN** wizard shows: "No provider templates found"
- **AND** offers raw mode as fallback

#### Scenario: Handle empty providers.d directory
- **WHEN** `~/.anima/providers.d/` exists but has no .yaml files
- **THEN** wizard shows: "No provider templates found"
- **AND** offers raw mode as fallback

#### Scenario: Handle malformed YAML file
- **WHEN** a YAML file cannot be parsed
- **THEN** wizard skips that file silently
- **AND** logs a warning
- **AND** continues with other files

---

### Requirement: Env resolver SHALL resolve apiKey references

The env resolver SHALL resolve `${ENV_VAR}` patterns from providers.d templates by searching multiple env sources.

#### Scenario: Resolve from process.env
- **WHEN** template has `apiKey: ${NAHCROF_API_KEY}`
- **AND** `process.env.NAHCROF_API_KEY` is set
- **THEN** resolver returns `{ resolved: true, value: "nahcrof_...", source: "env" }`

#### Scenario: Resolve from anima.env
- **WHEN** template has `apiKey: ${GEMINI_API_KEY}`
- **AND** `process.env.GEMINI_API_KEY` is not set
- **AND** `~/.anima/anima.env` contains `GEMINI_API_KEY=AIzaSy...`
- **THEN** resolver returns `{ resolved: true, value: "AIzaSy...", source: "anima-env" }`

#### Scenario: Resolve from .zshrc
- **WHEN** template has `apiKey: ${SOME_KEY}`
- **AND** key not in process.env or anima.env
- **AND** `~/.zshrc` contains `export SOME_KEY=sk-...`
- **THEN** resolver returns `{ resolved: true, value: "sk-...", source: "zshrc" }`

#### Scenario: Priority order
- **WHEN** key exists in multiple sources
- **THEN** resolver prefers: process.env > anima.env > .zshrc

#### Scenario: Handle default value pattern
- **WHEN** template has `apiKey: ${NINE_ROUTER_KEY:-none}`
- **AND** `NINE_ROUTER_KEY` is not found in any source
- **THEN** resolver returns `{ resolved: true, value: "none", source: "default" }`

#### Scenario: Handle literal key
- **WHEN** template has `apiKey: AIzaSyB5YyM7r...` (no `${}` pattern)
- **THEN** resolver returns `{ resolved: true, value: "AIzaSyB5YyM7r...", source: "literal" }`

#### Scenario: Handle unresolved variable
- **WHEN** template has `apiKey: ${MISSING_KEY}`
- **AND** key not found in any source
- **AND** no default value
- **THEN** resolver returns `{ resolved: false, source: null }`

#### Scenario: Handle OAuth pattern
- **WHEN** template has `apiKey: ${OAUTH:openai}`
- **THEN** resolver returns `{ resolved: false, isOAuth: true, oauthProvider: "openai" }`

#### Scenario: Parse anima.env format
- **WHEN** anima.env contains:
  ```
  GEMINI_API_KEY=AIzaSy...
  DEEPSEEK_API_KEY=sk-549...
  # comment line
  ANIMA_TELEGRAM_BOT_TOKEN=8396...
  ```
- **THEN** parser extracts all KEY=VALUE pairs
- **AND** skips comment lines
- **AND** handles values with special characters

#### Scenario: Parse .zshrc format
- **WHEN** .zshrc contains:
  ```bash
  export OPENAI_API_KEY=sk-abc123
  export ANTHROPIC_API_KEY="sk-ant-xyz"
  export GROQ_API_KEY='gsk_...'
  # comment
  alias ll='ls -la'
  ```
- **THEN** parser extracts only `export KEY=VALUE` lines
- **AND** handles single/double quotes
- **AND** skips comments, aliases, non-export lines

---

### Requirement: Template list SHALL show key status

The template list SHALL indicate whether each provider's API key is available.

#### Scenario: Key status indicators
- **WHEN** template list is displayed
- **THEN** each entry shows:
  - ✅ Key found (resolved from env)
  - ⚠️ Key missing (env var not set)
  - 🔑 OAuth required (uses ${OAUTH:*})
  - ⛔ Unsupported adapter (e.g. `generic` — not OpenAI/Anthropic compatible)

#### Scenario: Template list shows provider info
- **WHEN** template list is displayed
- **THEN** each entry shows:
  - Label (e.g. "Nahcrof AI")
  - API type (e.g. "openai")
  - Base URL (e.g. "crof.ai")
  - Key status indicator

---

### Requirement: Import mode SHALL auto-fill from template

When a template is selected, the wizard SHALL auto-fill provider configuration.

#### Scenario: Select template with found key
- **WHEN** user selects "Nahcrof AI" template
- **AND** key is resolved from anima.env
- **THEN** wizard auto-fills:
  - name: "nahcrof"
  - url: "https://crof.ai/v1"
  - adapter: "openai-chat" (mapped from "openai-completions")
  - models: ["deepseek-v4-pro", "glm-5.2", ...]
- **AND** shows key confirmation step

#### Scenario: Select template with missing key
- **WHEN** user selects template with missing key
- **THEN** wizard auto-fills name, url, adapter, models
- **AND** prompts for manual key entry

#### Scenario: Select template with OAuth
- **WHEN** user selects template with `${OAUTH:provider}`
- **THEN** wizard shows OAuth login prompt

#### Scenario: Select template with unsupported adapter
- **WHEN** user selects template with `api: generic` (e.g. Gemini)
- **THEN** wizard shows error: "This provider uses an unsupported API format (generic). Use Raw mode with an OpenAI-compatible proxy endpoint instead."
- **AND** does NOT proceed to connection test or save
- **AND** returns to template list

#### Scenario: User can override auto-filled name
- **WHEN** template auto-fills name as "nahcrof"
- **AND** user wants different name
- **THEN** wizard allows editing before confirming

---

### Requirement: Raw mode SHALL collect all provider details manually

#### Scenario: Raw mode steps
- **WHEN** user selects raw mode
- **THEN** wizard proceeds through:
  1. **Name**: Provider identifier
  2. **URL**: Base URL
  3. **Protocol**: Select from [OpenAI Chat, OpenAI Responses, Anthropic Messages]
  4. **API Key**: Masked input
  5. **Models**: Auto-scan or manual entry
  6. **Confirm**: Review and save

#### Scenario: Protocol selector
- **WHEN** user reaches protocol step
- **THEN** wizard shows 3 options:
  - "OpenAI Chat Completions" (default)
  - "OpenAI Responses API"
  - "Anthropic Messages API"

---

### Requirement: Manual model entry SHALL accept comma-separated input

#### Scenario: Manual model entry
- **WHEN** user selects manual model entry
- **THEN** wizard shows text input with hint: "Enter model names, separated by commas"
- **AND** user types: `gpt-4o, gpt-4o-mini, gpt-3.5-turbo`
- **AND** wizard parses into array: `["gpt-4o", "gpt-4o-mini", "gpt-3.5-turbo"]`

#### Scenario: Auto-scan fallback
- **WHEN** user selects auto-scan
- **AND** scan fails
- **THEN** wizard offers manual entry fallback

---

### Requirement: OAuth mode SHALL provide browser-based login

#### Scenario: OAuth login prompt
- **WHEN** user selects OAuth mode
- **OR** selects template with `${OAUTH:provider}`
- **THEN** wizard shows: "Login with [Provider]"
- **AND** offers two options:
  - "Open browser to sign in"
  - "Enter API key manually instead"

#### Scenario: OAuth browser flow (placeholder)
- **WHEN** user selects "Open browser to sign in"
- **THEN** wizard shows: "OAuth login coming soon"
- **AND** offers manual key entry as fallback

#### Scenario: OAuth manual fallback
- **WHEN** user selects "Enter API key manually instead"
- **THEN** wizard proceeds with manual key entry
- **AND** continues with import/raw flow

---

### Requirement: Config persistence SHALL reuse existing addProviderToConfig

#### Scenario: Import mode saves correctly
- **WHEN** user confirms import registration
- **THEN** wizard calls `addProviderToConfig()` with:
  - `name`: template id
  - `adapter`: mapped from template api
  - `baseUrl`: template baseUrl
  - `apiKey`: resolved or entered key
  - `defaultModel`: first model from template
- **AND** config.yaml is updated
- **AND** model-cache.json is updated with template models

#### Scenario: Raw mode saves correctly
- **WHEN** user confirms raw registration
- **THEN** wizard calls `addProviderToConfig()` with all collected fields

## Traceability

| Scenario | Test File |
|----------|-----------|
| Mode selector displayed | `tests/ui/provider-wizard.test.ts` |
| Default to import mode | `tests/ui/provider-wizard.test.ts` |
| Scan providers.d directory | `tests/template-scanner.test.ts` |
| Parse YAML template format | `tests/template-scanner.test.ts` |
| Handle missing providers.d | `tests/template-scanner.test.ts` |
| Handle empty providers.d | `tests/template-scanner.test.ts` |
| Handle malformed YAML | `tests/template-scanner.test.ts` |
| Resolve from process.env | `tests/env-resolver.test.ts` |
| Resolve from anima.env | `tests/env-resolver.test.ts` |
| Resolve from .zshrc | `tests/env-resolver.test.ts` |
| Priority order | `tests/env-resolver.test.ts` |
| Handle default value | `tests/env-resolver.test.ts` |
| Handle literal key | `tests/env-resolver.test.ts` |
| Handle unresolved variable | `tests/env-resolver.test.ts` |
| Handle OAuth pattern | `tests/env-resolver.test.ts` |
| Parse anima.env format | `tests/env-resolver.test.ts` |
| Parse .zshrc format | `tests/env-resolver.test.ts` |
| Key status indicators | `tests/ui/provider-wizard.test.ts` |
| Template list shows info | `tests/ui/provider-wizard.test.ts` |
| Select template with found key | `tests/ui/provider-wizard.test.ts` |
| Select template with missing key | `tests/ui/provider-wizard.test.ts` |
| Select template with OAuth | `tests/ui/provider-wizard.test.ts` |
| Select template with unsupported adapter | `tests/ui/provider-wizard.test.ts` + `tests/template-scanner.test.ts` |
| Override auto-filled name | `tests/ui/provider-wizard.test.ts` |
| Raw mode steps | `tests/ui/provider-wizard.test.ts` |
| Protocol selector | `tests/ui/provider-wizard.test.ts` |
| Manual model entry | `tests/ui/provider-wizard.test.ts` |
| Auto-scan fallback | `tests/ui/provider-wizard.test.ts` |
| OAuth login prompt | `tests/ui/provider-wizard.test.ts` |
| OAuth browser flow | `tests/ui/provider-wizard.test.ts` |
| OAuth manual fallback | `tests/ui/provider-wizard.test.ts` |
| Import mode saves | `tests/provider-config-writer.test.ts` |
| Raw mode saves | `tests/provider-config-writer.test.ts` |
