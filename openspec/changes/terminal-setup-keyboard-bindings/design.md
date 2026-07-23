## Architecture

To deliver an IDE-grade terminal experience, Kintsugi configures Node's `process.stdin` to raw mode. It intercepts raw terminal escape codes, handles key combos (like Shift+Enter), and listens to OS signals (`SIGWINCH`, `SIGINT`) to control layout recalculation and cancel streams.

## Components

- **RawKeypressParser**: Listens to raw `stdin` bytes, resolving keyboard escape sequences into semantic keys (e.g., `Shift+Enter`, `Ctrl+C`, `Escape`).
- **StreamAbortController**: Wraps API requests and subprocess tasks in a central AbortController which is aborted immediately when cancellation key sequences are intercepted.
- **ResizeListener**: Attaches to `process.stdout.on('resize')` (`SIGWINCH`), feeding updated terminal rows and columns back to the Ink layout renderer.

## Data Model

```typescript
interface KeypressEvent {
  name: string;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
  sequence: string;
}
```

## Test Strategy

| Scenario ID | Test File | Type |
|-------------|-----------|------|
| Prompt input field is multiline | `tests/terminal-inputs.test.ts` | unit |
| Interruption cancels active stream | `tests/terminal-inputs.test.ts` | integration |
| TUI rescales on resize | `tests/terminal-inputs.test.ts` | integration |
| Raw modes are restored on exit | `tests/terminal-inputs.test.ts` | unit |

## Dependencies

None. Uses native Node.js `readline.emitKeypressEvents` and `process.stdin`.

## Migration

No migrations needed. Backward compatible.
