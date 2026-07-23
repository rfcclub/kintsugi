# Intent: provider-registration-wizard

## Raw Request

Cho thêm 1 dòng đăng ký provider mới, khi nhấn vào sẽ hiện provider name, provider url, api key (hỗ trợ OAuth sau), xong sau đó đăng ký rồi quét model bỏ vào model-cache.json.

## Problem

Hiện tại Kintsugi chỉ hỗ trợ 4 provider cố định (mock, openai-chat, openai-responses, anthropic-messages) thông qua preset có sẵn. Người dùng muốn dùng provider tùy chỉnh (ví dụ: Crof.ai, Groq, Together AI, Ollama local, v.v.) phải tự soạn config YAML thủ công, không có UI hướng dẫn, dễ sai cú pháp. Ngoài ra, không có cơ chế tự động quét danh sách model từ provider — người dùng phải biết trước tên model.

## Desired Outcome

Người dùng có thể thêm provider mới trực tiếp từ TUI qua wizard tương tác, không cần soạn config thủ công. Wizard sẽ:
1. Hỏi **Provider Name** (tên định danh, ví dụ: "groq", "crof")
2. Hỏi **Base URL** (ví dụ: `https://api.groq.com/openai/v1`)
3. Hỏi **API Key** (nhập ẩn, hỗ trợ OAuth sau này)
4. Test kết nối với URL + key
5. Quét danh sách model từ provider (gọi `GET /models` hoặc tương đương)
6. Lưu kết quả vào `model-cache.json` trong thư mục config
7. Ghi provider config vào `.kintsugi/config.yaml`
8. Sau khi đăng ký, provider xuất hiện trong `/model` picker để chọn

Ngoài ra, `/provider` (không args) hiển thị trạng thái provider đang dùng.

## Users / Actors

- **User:** Muốn thêm provider tùy chỉnh mà không cần soạn config thủ công.
- **Provider Scanner Service:** Gọi HTTP tới provider endpoint để lấy danh sách models.
- **Config Writer:** Ghi/đọc file YAML và JSON cache.

## Current Context

- Provider presets được định nghĩa cứng trong `src/providers/config.ts`
- Model profiles trong config YAML (`~/.config/kintsugi/config.yaml`)
- Có sẵn Picker component trong TUI (`src/ui/components/Picker.tsx`)
- Provider list là 4 provider cố định trong Picker

## Proposed Direction

- Thêm slash command `/provider` với hai mode:
  - `/provider` (no args) → hiển thị overlay trạng thái provider hiện tại
  - `/provider add` → mở wizard tương tác
- Wizard được implement như một Ink component wizard, gồm nhiều bước (multi-step form)
- Dùng `fetch` (Node 18+ built-in) để test kết nối và quét models
- Dùng `yaml` (đã có trong dependencies) để ghi config
- Model cache format: JSON array ở `~/.config/kintsugi/model-cache.json`
- Phân luồng OAuth sẵn placeholder để sau này implement

## Scope

- `/provider` slash command (show status)
- `/provider add` wizard (name, url, key, test, scan, save)
- Model scanning via `GET {baseUrl}/models`
- Model cache file: `model-cache.json`
- Config auto-update: `.kintsugi/config.yaml`
- Provider xuất hiện trong Picker sau khi đăng ký

## Non-Goals

- OAuth 2.0 flow đầy đủ (chỉ để placeholder)
- Xóa provider (sẽ làm sau)
- Edit provider (sẽ làm sau)
- Provider ranking/benchmarking
- UI cho nhiều API key trên cùng một provider

## Constraints

- Phải chạy trên Node 18+ (fetch built-in, không cần thêm dependency HTTP)
- File `model-cache.json` không được commit lên git (thêm vào `.gitignore`)
- API Key phải được nhập ẩn (dùng `password` mask trong terminal)
- Phải handle timeout khi kết nối thất bại (5s timeout)
- Các provider OpenAI-compatible (chat/completions endpoint) là ưu tiên

## Success Criteria

- `/provider` hiển thị đúng provider, model, base URL, status (connected/error)
- `/provider add` wizard hoàn thành đủ 4 bước: name → url → key → test
- Sau khi test kết nối thành công, models được quét và cache
- Config được ghi vào file YAML tự động
- Provider mới xuất hiện trong `/model` picker
- Test coverage >80% trên các module mới

## Risks

- **API Key lộ trong log:** Không được log API key ra console.
  - Mitigation: Che dấu key khi nhập, không log args chứa key.
- **Provider không hỗ trợ `GET /models`:** Một số provider (Ollama) dùng endpoint khác.
  - Mitigation: Cho phép user nhập tay model, scan failure không block.
- **Config file bị hỏng:** Ghi YAML sai cú pháp.
  - Mitigation: Validate YAML trước khi ghi, backup file cũ.

## Ambiguities

### Blocking

<!-- None -->

### Non-Blocking

- Làm sao phân biệt provider OpenAI-compatible vs non-OpenAI?
  - Assumption: Mặc định assume OpenAI-compatible chat completions. Cho phép user override adapter type sau.
- Model cache có nên tự động refresh không?
  - Assumption: Chỉ cache khi add. Cho phép `/provider refresh` ở phase sau.

## Assumptions

- Provider API tuân theo OpenAI-compatible specification (có `GET /models` và `POST /chat/completions`)
- `fetch` API có sẵn trong Node.js 18+
- YAML dependency đã có sẵn (`yaml` package)

## Spec Seeds

- **REQ-PROV-001 (Show Status):** `/provider` hiển thị tên, base URL, model đang dùng, trạng thái kết nối.
- **REQ-PROV-002 (Add Wizard):** `/provider add` mở wizard tương tác gồm 3 input steps + 1 confirm step.
- **REQ-PROV-003 (Scan Models):** Sau khi test kết nối, tự động gọi endpoint models và cache kết quả.
- **REQ-PROV-004 (Config Persist):** Lưu provider config vào `.kintsugi/config.yaml`.
- **REQ-PROV-005 (Model Cache):** Lưu danh sách models vào `model-cache.json`.
- **REQ-PROV-006 (Picker Integrate):** Provider đã đăng ký xuất hiện trong `/model` picker.
- **REQ-PROV-007 (OAuth Placeholder):** Giao diện có sẵn option "Use OAuth" nhưng để placeholder.

## Intent Approval

Status: PENDING

Approved by: (pending)
Date: (pending)
