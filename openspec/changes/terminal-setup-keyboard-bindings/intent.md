# Intent: terminal-setup-keyboard-bindings

## Raw Request

Tối ưu hóa sâu sắc trải nghiệm gõ phím và tương tác trực tiếp trong Terminal. Khắc phục các vấn đề đơ phím, hỏng UI TUI khi người dùng nhấn các tổ hợp phím đặc biệt, hỗ trợ phím tắt hủy stream và gõ nhiều dòng mượt mà.

## Problem

Khi tương tác với Kintsugi CLI trong Terminal (đặc biệt là TUI chế độ Ink), trải nghiệm nhập liệu (input handling) còn thô sơ. Ví dụ: Người dùng không thể nhập nhiều dòng (multiline), nhấn `Ctrl + C` hoặc `Escape` thường làm crash/thoát luôn CLI thay vì chỉ hủy stream phản hồi của LLM hoặc tác vụ ngầm, và việc hiển thị UI dễ bị vỡ khi resize terminal hoặc nhấn các tổ hợp phím đặc biệt.

## Desired Outcome

Trải nghiệm terminal/TUI mượt mà như một editor thực thụ. Người dùng có thể xuống dòng bằng phím tắt, hủy luồng stream LLM ngay lập tức một cách an toàn mà không thoát CLI, và các phím tắt điều hướng hoạt động tin cậy trên các terminal emulator phổ biến (VS Code, iTerm2, Kitty).

## Users / Actors

- **User:** Nhập prompt phức tạp, điều khiển dừng/hủy stream bằng phím tắt.
- **Ink TUI Engine / Keypress Parser:** Đọc raw escape sequences và phát các event tương ứng.

## Current Context

- `package.json` sử dụng `ink` và `ink-text-input`.
- Việc xử lý ngắt tín hiệu (`SIGINT` / `Ctrl+C`) đang do Node.js runtime quản lý mặc định (thoát process).

## Proposed Direction

- Bắt các raw keypress events từ `stdin` trong raw mode.
- Triển khai bộ phân tích phím tắt nâng cao:
  - `Shift + Enter` hoặc `Alt + Enter`: Chèn ký tự newline `\n` thay vì submit prompt.
  - `Ctrl + C` / `Escape` (khi LLM đang stream): Trực tiếp gửi tín hiệu `abort` đến LLM client và các active child tasks.
  - `Ctrl + C` (lần 2 hoặc khi rảnh): Thoát CLI an toàn.
- Cung cấp lệnh `/terminal-setup` để tinh chỉnh môi trường terminal buffer.

## Scope

- Xử lý keypress raw mode trong Node/Ink.
- Hỗ trợ gõ prompt multiline mượt mà trên TUI.
- Cơ chế hủy stream (Stream Abortion) an toàn tích hợp với AbortController.
- Tự động điều chỉnh UI khi Terminal Resize (SIGWINCH handling).

## Non-Goals

- Xây dựng một trình soạn thảo văn bản Terminal đầy đủ chức năng (như Vim hay Nano).
- Hỗ trợ chuột (mouse events) trong phiên bản này.

## Constraints

- Phải hoạt động nhất quán trên cả macOS (zsh) và các Terminal Emulator phổ biến.
- Không gây xung đột với các phím tắt hệ thống của Terminal chính.

## Success Criteria

- Nhấn `Shift+Enter` xuống dòng thành công trên TUI.
- Khi LLM đang sinh văn bản, nhấn `Ctrl+C` hoặc `Esc` dừng stream ngay lập tức, đưa CLI về trạng thái sẵn sàng nhập prompt mới.
- Thay đổi kích thước cửa sổ terminal không làm méo hay vỡ giao diện vẽ bởi Ink.

## Risks

- **Terminal Lockup:** Đưa terminal vào raw mode lỗi có thể khiến terminal của người dùng bị đơ sau khi Kintsugi crash.
  - Mitigation: Đảm bảo luôn chạy cleanup code restore raw mode trong block `finally` và process hooks `uncaughtException`.

## Ambiguities

### Blocking

<!-- None -->

### Non-Blocking

- Làm thế nào để phân biệt `Ctrl+C` dùng để hủy stream vs `Ctrl+C` dùng để tắt CLI?
  - Assumption: Nếu có stream đang chạy (LLM hoặc Task), `Ctrl+C` thứ nhất sẽ hủy stream. Nếu không có gì chạy, hoặc nhấn `Ctrl+C` lần 2 liên tiếp, tắt CLI.

## Assumptions

- Terminal emulator của người dùng hỗ trợ ANSI escape codes tiêu chuẩn.

## Spec Seeds

- **REQ-KEY-001 (Multiline Input):** `ink-text-input` hoặc input field custom phải nhận diện được `Shift+Enter` để cho phép viết prompt nhiều dòng.
- **REQ-KEY-002 (Stream Interruption):** Tín hiệu `SIGINT` (`Ctrl+C`) hoặc `Escape` khi đang stream phải trigger AbortController để dừng API request.
- **REQ-KEY-003 (SIGWINCH Support):** Ứng dụng phải lắng nghe thay đổi kích thước terminal và render lại (re-render) layout sạch sẽ.
- **REQ-KEY-004 (Graceful Exit):** Khi thoát, terminal phải được khôi phục nguyên trạng (raw mode disabled, show cursor).

## Intent Approval

Status: APPROVED

Approved by: Thoor
Date: 2026-06-19
