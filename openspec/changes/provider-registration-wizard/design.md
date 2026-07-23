# Provider Registration Wizard — Design

## Architecture

Provider registration wizard là một **multi-step Ink form component** chạy trong TUI overlay. Khi user gõ `/provider add`, TUIView render `ProviderWizard` component thay vì overlay text thông thường. Wizard thu thập thông tin qua từng bước, gọi HTTP scan models, và ghi kết quả vào cả config YAML và model cache JSON.

```
┌─────────────────────────────────────────────────┐
│  /provider add — Step 1/4: Provider Name        │
│                                                 │
│  ▸ Enter a name for this provider               │
│    (e.g. "groq", "together", "ollama")          │
│                                                 │
│  ┌─────────────────────────────────────────────┐│
│  │ groq                                       ││
│  └─────────────────────────────────────────────┘│
│                                                 │
│  [Next >]                              [Cancel] │
└─────────────────────────────────────────────────┘
```

## Components

### 1. ProviderWizard (Ink Component)
- **File:** `src/ui/components/ProviderWizard.tsx`
- Multi-step state machine:
  1. **NameStep** — Nhập provider name (validate: không trùng, không rỗng)
  2. **UrlStep** — Nhập base URL (validate: URL hợp lệ)
  3. **KeyStep** — Nhập API key (ẩn ký tự, có toggle show/hide, có OAuth placeholder)
  4. **TestStep** — Test kết nối + scan models (spinner, progress)
  5. **ConfirmStep** — Tóm tắt thông tin, xác nhận lưu
- Props: `onComplete(providerConfig)`, `onCancel()`, `existingNames: string[]`

### 2. ProviderScanner (Service)
- **File:** `src/providers/scanner.ts`
- `testConnection(baseUrl, apiKey): Promise<{ ok: boolean; error?: string }>`
  - Gọi `GET {baseUrl}/models` với header `Authorization: Bearer {apiKey}`
  - Timeout 5 giây
- `scanModels(baseUrl, apiKey): Promise<ModelInfo[]>`
  - Parse response từ `/models` endpoint
  - Nếu scan fail, trả về empty array (không block)

### 3. ModelCache (Store)
## Data Model

```typescript
// Provider config saved to config.yaml
interface ProviderConfig {
  name: string;
  baseUrl: string;
  apiKey: string;
  adapter: "openai-chat" | "openai-responses" | "anthropic-messages";
  models: string[];
  authType: "api-key" | "oauth"; // oauth = placeholder
}

// Model cache in model-cache.json
interface ModelCache {
  [providerName: string]: ModelInfo[];
}

interface ModelInfo {
  id: string;
  name?: string;
  owned_by?: string;
  created?: number;
}

// Wizard step state
type WizardStep = "name" | "url" | "key" | "test" | "confirm";

interface WizardState {
  step: WizardStep;
  providerName: string;
  baseUrl: string;
  apiKey: string;
  useOAuth: boolean;
  testStatus: "idle" | "testing" | "success" | "error";
  testError?: string;
  scannedModels: ModelInfo[];
  scanStatus: "idle" | "scanning" | "success" | "error";
}
```

## Flow

```
User types /provider add
  ↓
TUI renders ProviderWizard overlay
  ↓
Step 1: Enter provider name → validate → Next
  ↓
Step 2: Enter base URL → validate URL → Next
  ↓
Step 3: Enter API key (masked) → [Optional: toggle OAuth] → Next
  ↓
Step 4: Testing connection...
  ├─ Success → Scanning models...
  │  ├─ Models found → Show list → Next
  │  └─ No models → Show warning → Skip / Next
  └─ Error → Show error → Back to edit key/url
  ↓
Step 5: Confirm summary
  ├─ Confirm → Save config + cache → Show success → Return
  └─ Cancel → Back to TUI
```

## /model Integration

Sau khi provider được đăng ký và model cache có dữ liệu, `/model` command phải hiển thị danh sách models từ cache cho provider đang dùng:

### Hiện tại (`/model` với 0 args)
- Show model profiles từ config (giữ nguyên)

### Mới: `/model list` hoặc `/model switch`
- Load models từ `model-cache.json` cho provider hiện tại
- Nếu có cache → hiển thị danh sách models dạng chọn (numbered list)
- User chọn số → model được set cho provider hiện tại
- Ghi model vào runtime để dùng ngay
- Nếu không có cache → hiển thị "No cached models. Run /provider add or configure manually."

### Model Selector Overlay
```
┌──────────────────────────────────────┐
│  /model — Select model for groq     │
│                                      │
│  Available models:                   │
│   1. llama3-70b-8192                 │
│   2. llama3-8b-8192                  │
│   3. mixtral-8x7b-32768             │
│   4. gemma2-9b-it                   │
│                                      │
│  Type number to select, or enter     │
│  a custom model name:                │
│  ┌────────────────────────────────┐  │
│  │                                │  │
│  └────────────────────────────────┘  │
│                                      │
│  [Enter=select]          [Esc=cancel]│
└──────────────────────────────────────┘
```

### Config tự động cập nhật
- Khi user chọn model từ cache → ghi model vào provider config trong YAML
- Lần sau vào TUI, model đó được load tự động

## File Map

| File | Action |
|------|--------|
| `src/ui/components/ProviderWizard.tsx` | CREATE |
| `src/providers/scanner.ts` | CREATE |
| `src/providers/cache.ts` | CREATE |
| `src/config/config.ts` | MODIFY (add `addProviderToConfig`) |
| `src/ui/components/Picker.tsx` | MODIFY (dynamic providers) |
| `src/ui/views/TuiView.tsx` | MODIFY (add `/provider` handler) |
| `src/ui/commands/slash.ts` | MODIFY (add `provider` to enum) |
| `src/providers/registry.ts` | MODIFY (create provider from custom config) |
| `src/providers/config.ts` | MODIFY (support custom presets) |
| `src/index.tsx` | MODIFY (load model cache) |
| `tests/provider-wizard.test.ts` | CREATE |
| `tests/provider-scanner.test.ts` | CREATE |
| `tests/provider-cache.test.ts` | CREATE |

## Test Strategy

| Scenario ID | Test File | Type |
|-------------|-----------|------|
| Wizard renders all 5 steps | `tests/provider-wizard.test.ts` | unit |
| Name validation (empty, duplicate) | `tests/provider-wizard.test.ts` | unit |
| URL validation (invalid format) | `tests/provider-wizard.test.ts` | unit |
| API key input masked | `tests/provider-wizard.test.ts` | unit |
| Connection test success/fail | `tests/provider-scanner.test.ts` | integration |
| Model scan parses response | `tests/provider-scanner.test.ts` | unit |
| Model cache read/write | `tests/provider-cache.test.ts` | unit |
| Model cache missing file | `tests/provider-cache.test.ts` | unit |
| Config YAML write | `tests/provider-cache.test.ts` | integration |
| `/provider` shows status | `tests/provider-wizard.test.ts` | integration |
| `/provider add` opens wizard | `tests/provider-wizard.test.ts` | integration |
| Picker shows custom providers | `tests/provider-wizard.test.ts` | integration |

## Dependencies

- `fetch` — Node.js 18+ built-in (no extra dep)
- `yaml` — đã có trong `package.json`
- `ink`, `ink-text-input` — đã có (cho wizard form)

## Migration

Không cần migration. Feature hoàn toàn mới, backward compatible.

- **File:** `src/providers/cache.ts`
- `readCache(): Record<string, ModelInfo[]>`
  - Đọc từ `~/.config/kintsugi/model-cache.json`
  - Nếu file không tồn tại, trả về `{}`
- `writeCache(provider: string, models: ModelInfo[]): void`
  - Ghi vào `model-cache.json`
- `getModels(provider: string): ModelInfo[]`

### 4. ConfigWriter (Utility)
- **File:** `src/config/config.ts` (thêm hàm mới)
- `addProviderToConfig(name, url, apiKey): void`
  - Đọc file config YAML, thêm entry, ghi lại
  - Backup file cũ trước khi ghi

### 5. Picker Extension
- **File:** `src/ui/components/Picker.tsx` (sửa)
- Load providers từ config + cache
- Thêm "Add new provider..." ở cuối list → mở wizard