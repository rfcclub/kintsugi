# Intent: provider-onboarding-preset-raw

## Raw Request

Phát triển tính năng tự add provider dựa trên 2 nguồn:
1. **Provider templates** từ `~/.anima/providers.d/*.yaml` — mỗi file là 1 provider đã cấu hình sẵn (id, label, api, baseUrl, apiKey env ref, models). Scan API key từ `~/.anima/anima.env` + `process.env` + `.zshrc`.
2. **Raw mode** — nhập thủ công name, URL, protocol, API_KEY, models.
3. **OAuth login** — cho provider dùng `${OAUTH:...}` pattern (ví dụ: OpenAI).

## Problem

`~/.anima/providers.d/` đã có 13 provider templates với đầy đủ metadata (id, label, api, baseUrl, models). Nhưng kintsugi không biết đọc format này — wizard bắt nhập tay từ đầu. User đã có hàng chục API key trong `anima.env` nhưng phải copy-paste lại.

## Desired Outcome

### Flow 1: Import từ providers.d (ưu tiên)
1. Scan `~/.anima/providers.d/*.yaml` — parse mỗi file thành provider template
2. Resolve `apiKey` reference: `${ENV_VAR}` → scan anima.env + process.env + .zshrc
3. Hiển thị danh sách provider templates đã detect, đánh dấu:
   - ✅ Key found (resolved)
   - ⚠️ Key missing (env var not set)
   - 🔑 OAuth required
4. Chọn provider → auto-fill name, URL, protocol, models → test connection → confirm → save

### Flow 2: Raw (custom provider)
1. Nhập name, URL, protocol, API_KEY
2. Chọn model: auto-scan hoặc nhập tay (comma-separated)
3. Confirm → save

### Flow 3: OAuth Login
1. Provider dùng `${OAUTH:provider_name}` trong apiKey field
2. Hiển thị "Login with [Provider]" button
3. Mở browser → user authorize → callback nhận token
4. Token lưu vào key file → confirm → save

## Users / Actors

- **User**: Có 13 provider templates trong providers.d, muốn import vào kintsugi
- **Template Scanner**: Parse YAML files trong providers.d
- **Env Resolver**: Resolve `${ENV_VAR}` references từ anima.env + process.env + .zshrc
- **OAuth Handler**: Quản lý OAuth flow cho `${OAUTH:*}` providers
- **Config Writer**: Ghi provider vào kintsugi config.yaml

## Current Context

- `~/.anima/providers.d/` có 13 YAML templates (nahcrof, gemini, supergrok, openrouter, opencode-go, neuralwatt, umans, xiaomi, cheapinfer, minimax, minimax-openai, openai, 9router)
- Format: `{id, label, api, baseUrl, apiKey, models[{id}]}`
- `api` values: `openai-completions`, `anthropic-messages`, `generic`
- `apiKey` patterns: `${ENV_VAR}`, literal key, `${OAUTH:provider}`
- `~/.anima/anima.env` có 20+ API keys
- Wizard đã có: ProviderWizard.tsx, scanner.ts, cache.ts, addProviderToConfig()

## Scope

- Template scanner: parse `~/.anima/providers.d/*.yaml`
- Env resolver: resolve `${ENV_VAR}` từ anima.env + process.env + .zshrc
- UI: mode selector (import / raw / oauth)
- Import flow: select template → resolve key → test → confirm → save
- Raw mode: name → url → protocol → key → models → confirm
- OAuth placeholder cho `${OAUTH:*}` providers
- Manual model entry (comma-separated)

## Non-Goals

- Hardcoded presets (dùng providers.d templates thay thế)
- Auto-refresh OAuth token
- Edit/xóa provider đã đăng ký
- Ghi vào providers.d (chỉ đọc)
- Support tất cả OAuth providers (placeholder trước)

## Constraints

- Node 18+ (fetch built-in, yaml package đã có)
- Không thêm dependency mới
- Backward compatible với kintsugi config.yaml hiện tại
- API key không log ra console
- providers.d chỉ đọc, không ghi
- anima.env chỉ đọc, không ghi

## Success Criteria

- Scan providers.d parse được tất cả 13 templates
- Resolve `${ENV_VAR}` đúng cho key có trong anima.env
- Import flow: chọn template → save trong 2-3 bước
- Hiển thị đúng trạng thái key (found/missing/oauth)
- Raw mode hoạt động đầy đủ
- OAuth placeholder sẵn
- Test coverage > 80%

## Risks

- **YAML parsing**: providers.d dùng format không chuẩn (không có `---` separator)
  - Mitigation: Parse từng file riêng, handle format quirks
- **Env var resolution**: `${VAR:-default}` và `${OAUTH:provider}` patterns
  - Mitigation: Regex parser cho `${ENV_VAR}`, `${ENV_VAR:-default}`, `${OAUTH:provider}`
- **Gemini API khác biệt**: Dùng `generic` api type, không phải OpenAI-compatible
  - Mitigation: Map `generic` → cần adapter riêng hoặc skip
