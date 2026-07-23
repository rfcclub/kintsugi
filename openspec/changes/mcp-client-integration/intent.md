# Intent: mcp-client-integration

## Raw Request

Biến Kintsugi thành một client Model Context Protocol (MCP) đầy đủ. Cho phép người dùng cắm bất kỳ máy chủ MCP nào (như postgres-mcp, jira-mcp, github-mcp) để mở rộng hệ thống tool động của Kintsugi ngay lập tức.

## Problem

Kintsugi hiện tại chỉ có các công cụ được code tĩnh (hardcoded tools). Việc tích hợp thêm các dịch vụ bên thứ ba (như Postgres, GitHub, Jira, Slack...) đòi hỏi lập trình viên phải tự viết adapter hoặc tool definition thủ công trong source code, làm giảm tốc độ mở rộng hệ sinh thái công cụ và tăng nợ kỹ thuật.

## Desired Outcome

Người dùng có thể khai báo danh sách MCP Server trong file cấu hình. Kintsugi sẽ tự động kết nối, khám phá (discover) các công cụ động, đăng ký chúng vào runtime loop và định tuyến các lệnh gọi từ LLM đến server tương ứng một cách minh bạch.

## Users / Actors

- **Developer / User:** Cấu hình các MCP Server qua file yaml/json.
- **AI Agent (Kintsugi Runtime):** Nhận diện các công cụ động từ MCP Server và gọi chúng khi cần.
- **MCP Servers:** Các process độc lập giao tiếp qua JSON-RPC 2.0.

## Current Context

- `src/tools/registry.ts` quản lý việc đăng ký các static tools.
- `src/runtime/loop.ts` điều phối việc gọi tool thông qua các custom implementation.

## Proposed Direction

- Hỗ trợ stdio transport (chạy MCP Server dưới dạng child process).
- Đọc file cấu hình từ `.kintsugi/mcp.json` hoặc config chung.
- Triển khai MCP Client protocol (JSON-RPC 2.0) để handshake (`initialize`), list tools (`tools/list`), và execute tools (`tools/call`).

## Scope

- Đọc và parse cấu hình MCP Server.
- Quản lý vòng đời (lifecycle) của các child process MCP Server (start/stop/clean up).
- Đăng ký động (dynamic registration) các công cụ MCP vào schema gửi lên LLM.
- Proxy kết quả thực thi công cụ từ MCP Server về LLM.

## Non-Goals

- Hỗ trợ kết nối SSE (HTTP) ở phiên bản đầu tiên (chỉ tập trung vào stdio).
- Tự động cài đặt (auto-install) các MCP Server thiếu package (người dùng tự cài).
- Trình quản lý UI cho MCP Server.

## Constraints

- Đảm bảo dọn dẹp (cleanup) tất cả các daemon child processes khi Kintsugi thoát (tránh zombie process).
- Tương thích tốt với các thư viện JSON-RPC tiêu chuẩn.

## Success Criteria

- Đăng ký thành công ít nhất 1 MCP Server (ví dụ: mock-mcp-server) qua stdio.
- LLM gọi thành công công cụ động từ MCP Server đó và nhận đúng kết quả.
- Tắt ứng dụng Kintsugi dọn dẹp sạch toàn bộ tiến trình con.

## Risks

- **Resource Leak:** Các server daemon không bị tắt khi agent crash đột ngột.
  - Mitigation: Đăng ký hook bắt các tín hiệu `SIGINT`, `SIGTERM`, `exit`, và sử dụng thư viện quản lý process bền bỉ.
- **Performance bottleneck:** Handshake với nhiều MCP Server lúc startup gây chậm trễ khởi động CLI.
  - Mitigation: Khởi động song song (parallel spawn) các MCP Servers và cache tool definition.

## Ambiguities

### Blocking

<!-- None -->

### Non-Blocking

- Định dạng file cấu hình (`.kintsugi/config.yaml` vs `mcp.json`).
  - Assumption: Hỗ trợ cả hai hoặc ưu tiên đọc từ `.kintsugi/mcp.json` giống như Claude Desktop để tối đa hóa tính tương thích.

## Assumptions

- Môi trường chạy đã cài sẵn các command/binary được khai báo trong cấu hình MCP.

## Spec Seeds

- **REQ-MCP-001 (Config Parsing):** Hệ thống phải đọc được cấu hình từ file `.kintsugi/mcp.json` tương thích với định dạng của Claude Desktop.
- **REQ-MCP-002 (Process Management):** Hệ thống phải spawn thành công các MCP Server chạy ngầm thông qua `stdio`.
- **REQ-MCP-003 (Schema Discovery):** Hệ thống phải fetch thành công danh sách tools từ server và convert sang đúng schema định dạng JSON-schema của LLM Tool Call.
- **REQ-MCP-004 (Routing / Proxy):** Khi LLM trigger một MCP tool, runtime loop phải proxy tham số đến server qua stdin JSON-RPC 2.0 và trả stdout về cho LLM.

## Intent Approval

Status: APPROVED

Approved by: Thoor
Date: 2026-06-19
