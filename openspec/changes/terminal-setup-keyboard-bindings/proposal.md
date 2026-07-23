## Why

To enhance the CLI user experience by parsing complex key chords (like Shift+Enter for multiline inputs), supporting quick execution aborts via Escape/Ctrl+C without crashing the CLI, and resolving TUI render corruption on terminal window resize.

## What Changes

- Implement advanced keypress event parser in Node/Ink.
- Enable `Shift + Enter` and `Alt + Enter` for inserting newlines in the prompt input field.
- Map `Ctrl + C` / `Escape` to trigger stream cancellation when an LLM request or subprocess is active.
- Listen for `SIGWINCH` resize signals to dynamically recalculate terminal viewport and re-render Ink components.
- **BREAKING**: None.

## Capabilities

### New Capabilities
- `terminal-setup-keyboard-bindings`: Intercept raw TUI input streams, capture multiline strings, cancel streams on demand, and preserve TUI rendering integrity.

### Modified Capabilities
None.

## Impact

- `src/ui/` components to use custom input controllers instead of basic text input.
- `src/cli/` runtime to handle OS signals (`SIGINT`, `SIGWINCH`).
