## Why

Kintsugi hiện chỉ hỗ trợ 4 provider cố định qua preset. Người dùng muốn dùng provider tùy chỉnh (Groq, Together AI, Ollama, Crof.ai, v.v.) phải tự viết config YAML thủ công. Việc thêm wizard đăng ký provider ngay trong TUI giúp:

- Giảm friction cho người dùng mới
- Không cần biết cấu trúc config YAML
- Tự động quét model — không cần nhớ tên model
- Provider mới xuất hiện ngay trong picker, sẵn sàng dùng

## What Changes

- Thêm slash command `/provider` với 2 sub-command: (no args) → show status, `add` → wizard
- Tạo `ProviderWizard` component (multi-step Ink form)
- Tạo `ProviderScanner` service (gọi HTTP scan models)
- Tạo `ModelCache` store (đọc/ghi `model-cache.json`)
- Mở rộng `Picker` component (load provider từ config + cache)
- Cập nhật config YAML tự động sau khi add thành công
- **BREAKING**: None. Backward compatible.

## Capabilities

### New Capabilities
- `provider-registration-wizard`: Tương tác thêm, test, quét và lưu provider mới.
- `model-cache`: Lưu danh sách model đã quét từ các provider.
- `provider-status`: Xem trạng thái provider đang dùng.

### Modified Capabilities
- `Picker`: Load providers từ config động thay vì danh sách cứng.
- `/model` command: Provider mới xuất hiện trong picker sau khi đăng ký.

## Impact

| File | Change |
|------|--------|
| `src/ui/commands/slash.ts` | Thêm `provider` vào `SlashCommandName` |
| `src/ui/views/TuiView.tsx` | Thêm handler cho `/provider` |
| `src/ui/components/ProviderWizard.tsx` | **CREATE** — Multi-step wizard component |
| `src/ui/components/Picker.tsx` | Sửa để load providers từ config + cache |
| `src/providers/scanner.ts` | **CREATE** — HTTP scanner cho models |
| `src/providers/cache.ts` | **CREATE** — Model cache read/write |
| `src/config/config.ts` | Thêm hàm ghi provider vào config YAML |
| `src/providers/registry.ts` | Thêm hàm tạo provider từ custom config |
| `tests/provider-wizard.test.ts` | **CREATE** — Wizard tests |
| `tests/provider-scanner.test.ts` | **CREATE** — Scanner tests |
| `tests/provider-cache.test.ts` | **CREATE** — Cache tests |
