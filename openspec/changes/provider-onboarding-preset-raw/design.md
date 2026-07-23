# Provider Onboarding (Import + Raw + OAuth) — Design

## Architecture

```
                    ┌──────────────────────────────────────────┐
                    │            ProviderWizard.tsx             │
                    │                                          │
                    │  ┌──────────┐  ┌──────────┐  ┌────────┐ │
                    │  │  Import  │  │   Raw    │  │  OAuth │ │
                    │  │  Mode    │  │  Mode    │  │  Mode  │ │
                    │  └────┬─────┘  └────┬─────┘  └───┬────┘ │
                    └───────┼────────────┼────────────┼───────┘
                            │            │            │
               ┌────────────▼───┐   ┌────▼────┐  ┌───▼────────┐
               │ TemplateScanner│   │ Scanner │  │ OAuth      │
               │ (new)          │   │ (exist) │  │ Handler    │
               │                │   │         │  │ (new)      │
               │ providers.d    │   │ test    │  │ browser    │
               │ YAML parse     │   │ scan    │  │ callback   │
               └───────┬────────┘   └────┬────┘  └───┬────────┘
                       │                 │           │
               ┌───────▼────────┐        │           │
               │ EnvResolver    │        │           │
               │ (new)          │        │           │
               │                │        │           │
               │ anima.env      │        │           │
               │ process.env    │        │           │
               │ .zshrc         │        │           │
               └───────┬────────┘        │           │
                       │                 │           │
               ┌───────▼─────────────────▼───────────▼───────┐
               │           Config Writer (existing)          │
               │       addProviderToConfig() + cache         │
               └─────────────────────────────────────────────┘
```

## Data Flow

### Import Mode Flow (from providers.d)
```
User selects "Import from providers.d"
  → TemplateScanner scans ~/.anima/providers.d/*.yaml
  → Parse each YAML: {id, label, api, baseUrl, apiKey, models[]}
  → EnvResolver resolves apiKey references:
      ${ENV_VAR} → scan process.env → anima.env → .zshrc
      ${ENV_VAR:-default} → with fallback
      ${OAUTH:provider} → mark as OAuth required
      literal key → use directly
  → Display list: label, api, baseUrl, key status (✅/⚠️/🔑)
  → User selects template
  → Auto-fill: name=id, url=baseUrl, adapter=mapApi(api), models=models[].id
  → If key found: test connection
  → If key missing: prompt manual entry
  → If OAuth: show OAuth button
  → Confirm → addProviderToConfig() + writeProviderCache()
```

### Raw Mode Flow
```
User selects "Custom Setup (Raw)"
  → Input name → validate (non-empty, unique)
  → Input URL → validate (http/https)
  → Select protocol (OpenAI Chat / OpenAI Responses / Anthropic Messages)
  → Input API key (masked)
  → Choose: auto-scan / manual model entry
  → If manual: parse comma-separated input
  → Confirm → save
```

### OAuth Flow
```
User selects provider with ${OAUTH:provider}
  → Show "Login with [Provider]" button
  → Open browser to authorize URL
  → Local callback server receives auth code
  → Exchange code for access token
  → Save token to key file
  → Continue with import flow
```

## New Module: TemplateScanner

```typescript
// src/providers/template-scanner.ts

interface ProviderTemplate {
  id: string;           // "nahcrof", "gemini", "supergrok"
  label: string;        // "Nahcrof AI", "Gemini", "SuperGrok (xAI)"
  api: string;          // "openai-completions", "anthropic-messages", "generic"
  adapter: string | null; // mapped adapter or null if unsupported
  baseUrl: string;      // "https://crof.ai/v1"
  apiKeyRef: string;    // "${NAHCROF_API_KEY}", "${OAUTH:openai}", literal
  models: string[];     // ["deepseek-v4-pro", "glm-5.2"]
  supported: boolean;   // false if adapter is null (generic, unknown)
  raw: Record<string, unknown>; // original YAML for round-trip
}

interface ScanTemplatesOptions {
  providersDir?: string; // default ~/.anima/providers.d
}

/**
 * Scan providers.d directory and parse all .yaml files.
 * Returns array of ProviderTemplate.
 */
function scanTemplates(options?: ScanTemplatesOptions): ProviderTemplate[];

/**
 * Parse a single provider YAML file.
 * Handles format quirks (no --- separator, inline models).
 */
function parseTemplateFile(filePath: string): ProviderTemplate | null;

/**
 * Map providers.d 'api' field to kintsugi adapter type.
 * Returns null for unsupported adapters (generic, unknown).
 */
function mapApiToAdapter(api: string): string | null;
```

### YAML Format (providers.d)
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

Note: YAML files don't have `---` separator. Each file is a single document.

## New Module: EnvResolver

```typescript
// src/providers/env-resolver.ts

interface EnvResolveResult {
  resolved: boolean;
  value?: string;
  source: "env" | "anima-env" | "zshrc" | "literal" | null;
  isOAuth: boolean;
  oauthProvider?: string;
}

interface EnvResolveOptions {
  animaEnvPath?: string;  // default ~/.anima/anima.env
  zshrcPath?: string;     // default ~/.zshrc
  env?: NodeJS.ProcessEnv;
}

/**
 * Resolve an apiKey reference from providers.d.
 * Handles patterns:
 *   ${ENV_VAR}           → scan env sources
 *   ${ENV_VAR:-default}  → with fallback
 *   ${OAUTH:provider}    → mark as OAuth
 *   literal-key          → use directly
 */
function resolveApiKeyRef(
  ref: string,
  options?: EnvResolveOptions
): EnvResolveResult;

/**
 * Parse anima.env file, extract KEY=VALUE pairs.
 * Similar to .zshrc parser but simpler format.
 */
function parseAnimaEnv(
  envPath?: string
): Map<string, string>;

/**
 * Parse .zshrc file, extract export KEY=VALUE pairs.
 * Handles quotes, inline comments, skips non-export lines.
 */
function parseZshrc(
  zshrcPath?: string
): Map<string, string>;

/**
 * Resolve env var from multiple sources with priority:
 * 1. process.env
 * 2. anima.env
 * 3. .zshrc
 */
function resolveEnvVar(
  name: string,
  options?: EnvResolveOptions
): { value: string; source: string } | null;
```

### Env Resolution Priority
1. `process.env[KEY]` — already active in shell
2. `~/.anima/anima.env` — anima-specific keys
3. `~/.zshrc` — shell profile

### Pattern Parsing
```
${NAHCROF_API_KEY}           → resolveEnvVar("NAHCROF_API_KEY")
${NAHCROF_API_KEY:-none}     → resolveEnvVar("NAHCROF_API_KEY") || "none"
${OAUTH:openai}              → { isOAuth: true, oauthProvider: "openai" }
sk-abc123                    → { resolved: true, value: "sk-abc123", source: "literal" }
```

## API Mapping

| providers.d `api` | kintsugi adapter | Import? |
|---|---|---|
| `openai-completions` | `openai-chat` | ✅ Yes |
| `anthropic-messages` | `anthropic-messages` | ✅ Yes |
| `generic` | — | ❌ Unsupported (different API format) |

### Unsupported Adapters

Templates with `api: generic` (e.g. Gemini) use a non-OpenAI-compatible API format
that kintsugi adapters don't support. These templates will:
- Show in the import list with a ⛔ indicator and "Unsupported adapter" label
- Be selectable but show an error message: "This provider uses an unsupported API format.
  Use Raw mode with an OpenAI-compatible proxy endpoint instead."
- NOT proceed to connection test or save

## UI Components

### ModeSelector
```
╭──────────────────────────────────────────────╮
│  Add Provider                                │
│                                              │
│  ▸ Import from providers.d                   │
│    13 templates found                        │
│                                              │
│    Custom Setup (Raw)                        │
│    Configure any provider manually           │
│                                              │
│    OAuth Login                               │
│    Sign in with provider account             │
╰──────────────────────────────────────────────╯
```

### TemplateList (import mode)
```
╭──────────────────────────────────────────────╮
│  Select Provider Template                    │
│                                              │
│  ▸ Nahcrof AI        ✅  openai   crof.ai   │
│    Gemini            ⛔  generic  UNSUPPORTED│
│    SuperGrok (xAI)   🔑  openai   api.x.ai  │
│    OpenRouter        ✅  openai   openrouter │
│    OpenCode Go       ✅  openai   opencode   │
│    NeuralWatt        ⚠️  openai   neuralwatt │
│    Umans AI          ✅  openai   code.umans │
│    Xiaomi            ✅  openai   xiaomimimo │
│    CheapestInference ✅  openai   cheapest   │
│    MiniMax (OpenAI)  ⚠️  openai   minimax    │
│    MiniMax           ✅  anthro   minimax    │
│    OpenAI            🔑  openai   api.openai │
│    9router (local)   ✅  openai   localhost   │
╰──────────────────────────────────────────────╯

✅ = key found  ⚠️ = key missing  🔑 = OAuth  ⛔ = unsupported adapter
```


### KeyConfirm (when key found)
```
╭──────────────────────────────────────────────╮
│  API Key — Nahcrof AI                        │
│                                              │
│  Found in anima.env: nahcrof_Xm...kw        │
│                                              │
│  ▸ Use this key                              │
│    Enter different key                       │
╰──────────────────────────────────────────────╯
```

### KeyMissing (when key missing)
```
╭──────────────────────────────────────────────╮
│  API Key — NeuralWatt                        │
│                                              │
│  No key found for NEURALWATT_API_KEY         │
│                                              │
│  Enter API key:                              │
│  ••••••••••••••••••••                        │
╰──────────────────────────────────────────────╯
```

### OAuthPrompt (when OAuth required)
```
╭──────────────────────────────────────────────╮
│  Sign In — OpenAI                            │
│                                              │
│  This provider requires OAuth login.         │
│                                              │
│  ▸ Open browser to sign in                   │
│    Enter API key manually instead            │
╰──────────────────────────────────────────────╯
```

## Wizard State Machine

```
                    ┌──────────┐
                    │  mode    │
                    │ selector │
                    └────┬─────┘
                         │
           ┌─────────────┼─────────────┐
           ▼             ▼             ▼
     ┌──────────┐  ┌──────────┐  ┌──────────┐
     │  import  │  │   raw    │  │  oauth   │
     │  list    │  │  name    │  │  prompt  │
     └────┬─────┘  └────┬─────┘  └────┬─────┘
          │              │             │
     ┌────▼─────┐  ┌────▼─────┐  ┌────▼─────┐
     │  key     │  │   url    │  │  browser │
     │  check   │  └────┬─────┘  │  auth    │
     └────┬─────┘       │        └────┬─────┘
          │        ┌────▼─────┐       │
     ┌────▼─────┐  │ protocol │  ┌────▼─────┐
     │  test    │  └────┬─────┘  │  token   │
     │  scan    │       │        │  save    │
     └────┬─────┘  ┌────▼─────┘  └────┬─────┘
          │        │   key    │       │
     ┌────▼─────┐  └────┬─────┘  ┌────▼─────┐
     │ confirm  │       │        │ confirm  │
     └──────────┘  ┌────▼─────┘  └──────────┘
                   │  models  │
                   └────┬─────┘
                        │
                   ┌────▼─────┐
                   │ confirm  │
                   └──────────┘
```

## Files Changed

| File | Type | Description |
|------|------|-------------|
| `src/providers/template-scanner.ts` | CREATE | Parse providers.d YAML templates |
| `src/providers/env-resolver.ts` | CREATE | Resolve env var references |
| `src/ui/components/ProviderWizard.tsx` | MODIFY | 3-mode wizard (import/raw/oauth) |
| `tests/template-scanner.test.ts` | CREATE | Template scanner tests |
| `tests/env-resolver.test.ts` | CREATE | Env resolver tests |
| `tests/ui/provider-wizard.test.ts` | MODIFY | Import/oauth mode tests |
