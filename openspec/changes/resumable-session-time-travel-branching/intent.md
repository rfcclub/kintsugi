# Intent: resumable-session-time-travel-branching

## Raw Request

Cơ chế "du hành thời gian" trong JSONL event store. Cho phép người dùng xem lại toàn bộ lịch sử turn-by-turn, quay ngược lại một thời điểm bất kỳ trong quá khứ, sửa đổi chỉ thị, rollback các tool calls sai lầm, và bắt đầu rẽ nhánh (branching) lịch sử chat từ điểm đó.

## Problem

Khi Agent đi sai hướng (chạy tool hỏng, viết code lỗi, bị ảo tưởng), lịch sử hội thoại sẽ bị tràn ngập thông tin rác. Người dùng hiện tại không có cách nào để "undo" hiệu quả ngoài việc tắt CLI đi bật lại và giải thích lại từ đầu, gây lãng phí context token rất lớn và làm gián đoạn mạch làm việc.

## Desired Outcome

Người dùng có khả năng quay ngược thời gian (rewind) về bất kỳ turn nào trong quá khứ. Hệ thống sẽ khôi phục lại trạng thái hội thoại (chat history) và tùy chọn rollback các file thay đổi về thời điểm đó. Ngoài ra, người dùng có thể rẽ nhánh (branch) hội thoại để thử nghiệm hướng đi mới mà không ghi đè lên session cũ.

## Users / Actors

- **User:** Gõ lệnh điều khiển `/rewind` hoặc `/session branch` để kiểm soát lịch sử.
- **Kintsugi Engine:** Khôi phục trạng thái bộ nhớ RAM, cập nhật file JSONL logs và workspace files.

## Current Context

- Session logs được lưu tuần tự dưới dạng JSON Lines (JSONL).
- Chưa có cơ chế quản lý snapshot hoặc rollback file.

## Proposed Direction

- Triển khai lệnh `/rewind <turn_number>`:
  - Cắt cụt (truncate) file JSONL từ turn được chỉ định.
  - Reset lại bộ nhớ trong RAM của Kintsugi Runtime cho khớp với state tại turn đó.
- Khôi phục file hệ thống: Sử dụng git diff/commit tạm thời hoặc cache file để hoàn tác các chỉnh sửa file được thực hiện bởi Agent từ turn đó.
- Triển khai lệnh `/session branch <branch_name>` tạo bản sao của session hiện tại sang một file JSONL mới.

## Scope

- Đọc, parse và truncate file JSONL logs.
- Khôi phục trạng thái hội thoại (history/memory) của Runtime.
- Rollback các file bị sửa đổi trong workspace (tích hợp với Git).
- Cơ chế rẽ nhánh session.

## Non-Goals

- Triển khai một hệ thống quản lý phiên bản (VCS) thay thế hoàn toàn cho Git.
- Khôi phục trạng thái của các dịch vụ bên ngoài (database, external API calls).

## Constraints

- Chỉ khôi phục được các thay đổi file nằm trong Workspace được quản lý bởi Git (hoặc các file mà Kintsugi trực tiếp tác động).

## Success Criteria

- Chạy `/rewind 3` thành công: Lịch sử hội thoại của Kintsugi chỉ hiển thị đến turn 3, các turn sau biến mất.
- Các file bị sửa đổi sau turn 3 tự động hoàn tác về trạng thái cũ.
- Khởi động nhánh session mới thành công từ một điểm rewind.

## Risks

- **Uncommitted Changes Loss:** Việc rollback file có thể ghi đè lên các sửa đổi thủ công của người dùng chưa commit.
  - Mitigation: Cảnh báo người dùng trước khi thực hiện rollback file, hoặc chỉ thực hiện rollback đối với các file do Agent trực tiếp chỉnh sửa (được ghi nhận trong tool logs).

## Ambiguities

### Blocking

<!-- None -->

### Non-Blocking

- Rollback file bằng cách nào là an toàn nhất?
  - Assumption: Tận dụng Git bằng cách tạo các commit tạm thời (temporary stash/commits) cho mỗi turn, giúp việc rollback cực kỳ chính xác và không sợ mất code.

## Assumptions

- Thư mục dự án là một Git repository hợp lệ để có thể thực hiện rollback file hiệu quả.

## Spec Seeds

- **REQ-RES-001 (Log Truncation):** Hệ thống phải cắt cụt file JSONL session logs tại vị trí turn được chỉ định mà không làm hỏng cấu trúc file.
- **REQ-RES-002 (State Hydration):** Kintsugi Runtime phải reconstruct lại toàn bộ bộ nhớ hội thoại chính xác từ file JSONL đã cắt cụt.
- **REQ-RES-003 (Git Rollback Adapter):** Triển khai Git adapter để khôi phục trạng thái các file nguồn về đúng thời điểm turn tương ứng.
- **REQ-RES-004 (Session Branching):** Hỗ trợ nhân bản session hiện tại ra file log mới để chạy nhánh thử nghiệm độc lập.

## Intent Approval

Status: APPROVED

Approved by: Thoor
Date: 2026-06-19
