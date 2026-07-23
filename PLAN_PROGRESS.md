# 🌸 Kintsugi Advanced Features - Master Plan & Progress Tracker

Tài liệu này lưu trữ lộ trình thiết kế, đặc tả kiến trúc và tiến độ thực thi của **5 tính năng nâng cao** nhằm biến Kintsugi thành một AI Coding Shell đỉnh cấp vũ trụ.

---

## 🗺️ Lộ Trình Tổng Quan (Master Roadmap)

| STT | Tính Năng / Phân Hệ | Pha Hiện Tại | Trạng Thái | File / Thư Mục Mục Tiêu | Ghi Chú |
| :--- | :--- | :---: | :---: | :--- | :--- |
| **1** | **Lifecycle Hooks (`PreToolUse` / `PostToolUse`)** | Hoàn Thành | ✅ Hoàn thành | `src/runtime/loop.ts`, `src/config/` | Cơ chế lai Hybrid (Shell + JSON IPC Pipe) |
| **2** | **MCP Client Integration** | Lên Ý Tưởng | ⏳ Chờ duyệt | `src/protocol/mcp.ts`, `src/tools/` | Giao thức kết nối Jira, Postgres, GitHub... |
| **3** | **Subagents Parallelism & Isolation** | Lên Ý Tưởng | ⏳ Chờ duyệt | `src/runtime/subagents.ts` | Cơ chế chạy song song subagents cô lập |
| **4** | **Resumable Session Time-Travel & Branching** | Lên Ý Tưởng | ⏳ Chờ duyệt | `src/store/`, `src/runtime/session.ts` | Du hành thời gian, rollback & rẽ nhánh |
| **5** | **Terminal Setup & Keyboard Bindings** | Lên Ý Tưởng | ⏳ Chờ duyệt | `src/ui/`, `src/cli/` | Tối ưu hóa phím tắt, cancel stream, SIGINT |

---

## 🔌 1. Lifecycle Hooks (`PreToolUse` / `PostToolUse`) [HOÀN THÀNH ✅]

### A. Mô tả hoạt động
Cho phép chạy linter, formatter, kiểm tra bảo mật trước khi chạy tool (`Pre`), và chạy kiểm thử tự động, nén token logs sau khi chạy tool (`Post`).

### Progress Checklist
- [x] Step 1: Grounding & Identity Check (Aura Persona Activated)
- [x] Step 2: Establish Scope & Decompose Features
- [x] Step 3: Align on Core Architecture (Option C: Hybrid JSON IPC approved)
- [x] Step 4: Complete Brainstorming & Design Sections
  - [x] Section 1: Configuration Schema & Discovery
  - [x] Section 2: JSON IPC Data Protocol (stdin/stdout)
  - [x] Section 3: Loop Integration Flow
  - [x] Section 4: Testing & Rollback Rules
- [x] Step 5: Write Final Spec to `docs/superpowers/specs/`
- [x] Step 6: Create TDD-driven Implementation Plan
- [x] Task 1: Extend Configuration Schema & Merging Logic (Completed ✓)
- [x] Task 2: Build the Core Hooks Execution Engine (Completed ✓)
- [x] Task 3: Integrate Pre/Post Middleware in Tool Execution Loop (Completed ✓)
- [x] Task 4: Complete Integration Test Suite (Timeout, Rollbacks, Fallbacks) (Completed ✓)

### B. Cấu Hình & Tự Động Phát Hiện
Cấu hình tại `.kintsugi/config.yaml` kết hợp tự động quét thư mục `.kintsugi/hooks/` tìm file script dạng `pre-<tool_name>.[js|ts|py|sh]`.
```yaml
hooks:
  mode: strict
  timeoutMs: 5000
  pre:
    edit_file: "npm run lint -- --fix"
    bash: "node .kintsugi/hooks/pre-bash.js"
  post:
    write_file: "vitest run"
```

### C. Giao Thức IPC (stdin/stdout JSON Pipe)
*   **stdin (Kintsugi -> Hook)**: Truyền JSON chứa thông tin tool call (`id`, `tool`, `arguments`, `context`, `output`, `isError`).
*   **stdout (Hook -> Kintsugi)**: Hook phản hồi JSON điều khiển:
    *   `status`: `"allow"` hoặc `"deny"`.
    *   `args`: Sửa đổi tham số tool động trước khi chạy (chỉ cho `pre`).
    *   `output`: Sửa đổi/Nén kết quả trả về của tool trước khi gửi cho LLM (chỉ cho `post`).
    *   `error`: Thông điệp báo lỗi chi tiết khi `status: "deny"`.

### D. Tích Hợp Vào Runtime Loop (`src/runtime/loop.ts`)
Tự động intercept tại hàm `executeToolRequest`:
1.  Chạy `pre-hook` -> Nếu `deny` thì đoản mạch (short-circuit) không chạy tool, trả lỗi về LLM. Nếu trả về `args` mới -> Cập nhật tham số.
2.  Chạy tool thực tế.
3.  Chạy `post-hook` -> Nếu `deny` thì đánh dấu tool lỗi. Nếu trả về `output` mới -> Ghi đè kết quả.

---

## 🔗 2. MCP Client Integration [LÊN Ý TƯỞNG ⏳]

### A. Mô tả hoạt động
Biến Kintsugi thành một client Model Context Protocol (MCP) đầy đủ. Cho phép người dùng cắm bất kỳ máy chủ MCP nào (như postgres-mcp, jira-mcp, github-mcp) để mở rộng hệ thống tool động của Kintsugi ngay lập tức.

### B. Thiết Kế Kiến Trúc
*   **Discovery**: Đọc cấu hình từ `.kintsugi/mcp.json` or `mcpServers` trong config chính.
*   **Transport**: Hỗ trợ giao thức truyền thông stdio (JSON-RPC 2.0 qua child process stdin/stdout).
*   **Runtime Integration**:
    *   Khi khởi động, Kintsugi spawn các tiến trình MCP Server dưới dạng daemon.
    *   Kintsugi gọi lệnh `tools/list` của từng server để lấy schema của các tool mở rộng.
    *   Đăng ký các tool này vào `src/tools/registry.ts` động của Kintsugi để gửi lên LLM.
    *   Khi LLM gọi một MCP tool, Kintsugi đóng vai trò proxy chuyển tiếp (`tools/call`) sang MCP Server và nhận kết quả trả về.

---

## 🤖 3. Subagents Parallelism & Isolation [LÊN Ý TƯỞNG ⏳]

### A. Mô tả hoạt động
Cho phép Agent chính của Kintsugi spawn ra các Agent phụ (Subagents) chạy song song độc lập ở background để giải quyết các tác vụ biệt lập (như nghiên cứu tài liệu, chạy thử test suites, refactor code) mà không làm loãng/phình to context window của thread chính.

### B. Thiết Kế Kiến Trúc
*   **Message-Passing IPC**: Agent chính giao tiếp với Subagents qua công cụ gửi tin nhắn `send_message`.
*   **Sandbox & Isolation**:
    *   Mỗi Subagent chạy trên một instance `KintsugiRuntime` riêng biệt.
    *   Có `messagePool` (history) hoàn toàn độc lập và system prompt được tinh gọn tối đa cho nhiệm vụ cụ thể.
    *   Được phân quyền (permissions) giới hạn hơn (ví dụ: Subagent nghiên cứu chỉ có quyền `read_file`, không có quyền `bash` hoặc `write_file`).
*   **TUI Multi-Task Board**: Giao diện TUI hiển thị tiến trình của từng subagent chạy ngầm dưới dạng các thẻ tiến trình nhỏ gọn, hỗ trợ phím tắt `/agent <id>` để nhảy log.

---

## ⏳ 4. Resumable Session Time-Travel & Branching [LÊN Ý TƯỞNG ⏳]

### A. Mô tả hoạt động
Cơ chế "du hành thời gian" trong JSONL event store. Cho phép người dùng xem lại toàn bộ lịch sử turn-by-turn, quay ngược lại một thời điểm bất kỳ trong quá khứ, sửa đổi chỉ thị, rollback các tool calls sai lầm, và bắt đầu rẽ nhánh (branching) lịch sử chat từ điểm đó.

### B. Thiết Kế Kiến Trúc
*   **Event Ledger**: Tận dụng triệt để file JSONL session store hiện tại của Kintsugi làm "Git commit log".
*   **Lệnh `/rewind <turn_index>`**:
    *   Khi người dùng chạy `/rewind 5`: Kintsugi sẽ cắt cụt (truncate) toàn bộ lịch sử file JSONL từ turn thứ 5 trở đi.
    *   Cập nhật lại trạng thái bộ nhớ RAM của `KintsugiRuntime` tương ứng với snapshot tại turn thứ 5.
    *   Xóa sạch các file tạm hoặc rollback các thay đổi file trong phiên làm việc nếu được yêu cầu.
*   **Branching**: Cho phép lưu session hiện tại thành một nhánh mới (ví dụ: `/session branch feat-xyz`) để thử nghiệm các hướng đi khác nhau mà không làm hỏng session chính.

---

## ⌨️ 5. Terminal Setup & Keyboard Bindings [LÊN Ý TƯỞNG ⏳]

### A. Mô tả hoạt động
Tối ưu hóa sâu sắc trải nghiệm gõ phím và tương tác trực tiếp trong Terminal. Khắc phục các vấn đề đơ phím, hỏng UI TUI khi người dùng nhấn các tổ hợp phím đặc biệt, hỗ trợ phím tắt hủy stream và gõ nhiều dòng mượt mà.

### B. Thiết Kế Kiến Trúc
*   **Escape Sequences Parser**: Tích hợp trình phân tích keypress của Ink để bắt các tổ hợp phím nâng cao:
    *   `Shift + Enter`: Xuống dòng để viết prompt nhiều dòng (multiline).
    *   `Ctrl + C` hoặc `Escape`: Hủy luồng phản hồi của LLM (stream abortion) ngay lập tức và gửi tín hiệu cancel an toàn tới các child process đang chạy.
*   **Shell Integration**: Cung cấp lệnh `/terminal-setup` để tự động chèn các escape sequence tương thích với VS Code Integrated Terminal, iTerm2, Kitty, giúp đồng bộ hóa clipboard và kích hoạt chế độ "alternate screen buffer" mượt mà.

---

## 📈 Nhật Ký Thay Đổi & Tiến Độ
*   **2026-06-01**: Đồng bộ hóa bản Master Plan hoàn mỹ trong `/Users/thoor/repo/kintsugi/PLAN_PROGRESS.md`. Hoàn tất thiết kế toàn bộ phân hệ **Lifecycle Hooks** (Feature 1) và nạp file Spec thành công.
