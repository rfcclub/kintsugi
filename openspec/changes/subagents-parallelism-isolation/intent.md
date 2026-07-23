# Intent: subagents-parallelism-isolation

## Raw Request

Cho phép Agent chính của Kintsugi spawn ra các Agent phụ (Subagents) chạy song song độc lập ở background để giải quyết các tác vụ biệt lập (như nghiên cứu tài liệu, chạy thử test suites, refactor code) mà không làm loãng/phình to context window của thread chính.

## Problem

Khi đối mặt với các tác vụ phức tạp đòi hỏi nhiều bước tìm kiếm, kiểm thử hoặc đọc hiểu sâu, việc chạy mọi thứ trên một luồng hội thoại duy nhất (single thread) sẽ làm phình to context window của Agent chính. Điều này gây tốn kém token, làm tăng độ trễ (latency), và làm loãng sự tập trung của Agent vào mục tiêu cốt lõi.

## Desired Outcome

Agent chính có thể ủy thác (delegate) công việc cho các Subagents chạy ngầm một cách song song. Mỗi Subagent chạy trên một ngữ cảnh cô lập (isolated context) và giao tiếp với Agent chính thông qua cơ chế truyền tin (message-passing). Agent chính có thể tiếp tục xử lý việc khác hoặc chờ kết quả phản hồi mà không bị tắc nghẽn.

## Users / Actors

- **Main Agent:** Điều phối tác vụ, sinh ra các subagents, nhận kết quả và tổng hợp.
- **Subagents:** Các luồng xử lý độc lập chạy ngầm, thực thi nhiệm vụ chuyên biệt.
- **Developer / User:** Theo dõi hoạt động của các agent trên giao diện Terminal (TUI).

## Current Context

- `src/runtime/loop.ts` quản lý một vòng lặp hội thoại đơn luồng.
- `src/runtime/` chưa hỗ trợ đa nhân hoặc chia tách luồng hội thoại (threads/history).

## Proposed Direction

- Tạo class `SubagentManager` quản lý vòng đời và lưu trữ state của từng Subagent.
- Cung cấp tool `invoke_subagent` cho Main Agent để khai báo và kích hoạt Subagent.
- Cách ly bộ nhớ lịch sử (`MessagePool`) và chỉ thị (`System Prompt`) của Subagent.
- Cho phép áp đặt quyền hạn (Permissions) giới hạn hơn đối với Subagent (ví dụ: cấm chạy bash script tự do, chỉ cho phép read-only).

## Scope

- Thiết kế cơ chế Message-Passing IPC giữa Main Agent và Subagent.
- Cơ chế cô lập Context Window (không chia sẻ chat history, chỉ chia sẻ workspace files).
- Phân quyền động cho Subagent.
- Hiển thị tiến trình chạy ngầm của Subagents dưới dạng TUI component đơn giản.

## Non-Goals

- Hỗ trợ đa luồng thực thụ kiểu CPU OS (multi-threading). Subagent chạy dạng asynchronous execution promises.
- Tự động phân rã tác vụ (Auto-decomposition). Việc quyết định chia việc cho subagent vẫn do LLM quyết định qua Tool Call.

## Constraints

- Ngăn chặn tình trạng đệ quy vô hạn (Subagent A đẻ ra Subagent B đẻ ra Subagent A) -> Giới hạn depth tối đa của subagent tree (ví dụ: max depth = 2).
- Giới hạn số lượng Subagent chạy đồng thời (max concurrency) để tránh cạn kiệt tài khoản API/Tokens.

## Success Criteria

- Main Agent gọi thành công `invoke_subagent` để giải một bài toán nhỏ.
- Subagent thực thi độc lập, ghi log riêng, và gửi kết quả về qua event/message mà không can thiệp vào history của Main Agent.
- Kintsugi TUI cập nhật trực quan khi Subagent đang chạy.

## Risks

- **Token Explosion:** Subagents chạy vòng lặp vô tận gây tiêu tốn lượng token khổng lồ trong thời gian ngắn.
  - Mitigation: Đặt hạn mức token/số lượt gọi API (max turns) nghiêm ngặt cho mỗi subagent.
- **Workspace Conflicts:** Nhiều subagents ghi đè file của nhau cùng lúc.
  - Mitigation: Cảnh báo hoặc lock các file quan trọng, hoặc khuyến khích subagent nghiên cứu/read-only trước.

## Ambiguities

### Blocking

<!-- None -->

### Non-Blocking

- Subagent có nên chạy trên git worktree/branch riêng để tránh conflict file vật lý không?
  - Assumption: V1 sẽ chia sẻ chung workspace thư mục hiện tại để đơn giản hóa, nhưng khuyến cáo subagent viết vào file scratch hoặc chạy read-only.

## Assumptions

- Agent chính đủ thông minh để viết prompt mô tả nhiệm vụ rõ ràng cho subagents.

## Spec Seeds

- **REQ-SUB-001 (Isolation):** Mỗi Subagent phải chạy trên một thực thể `KintsugiRuntime` riêng biệt với system prompt và history độc lập.
- **REQ-SUB-002 (Message Loop):** Cung cấp công cụ giao tiếp hai chiều (`send_message`, `on_message`).
- **REQ-SUB-003 (TUI Monitoring):** Terminal UI phải hiển thị trạng thái của các subagent đang hoạt động (ví dụ: `[Subagent-1: Running]`).
- **REQ-SUB-004 (Depth & Concurrency Limits):** Hệ thống phải từ chối chạy nếu depth vượt quá 2 hoặc số lượng subagents hoạt động song song vượt quá giới hạn cấu hình.

## Intent Approval

Status: APPROVED

Approved by: Thoor
Date: 2026-06-19
