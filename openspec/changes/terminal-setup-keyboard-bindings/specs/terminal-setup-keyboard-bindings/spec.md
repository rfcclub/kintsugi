# terminal-setup-keyboard-bindings Specification

## Purpose
Define requirements for low-level keyboard input interception, multiline editing, stream/task interruption, and viewport scaling behavior within Kintsugi's TUI.

## Requirements

### Requirement: Prompt input field SHALL support multiline entries

Kintsugi input components MUST capture `Shift + Enter` or `Alt + Enter` key chords and append a newline `\n` character rather than submitting the text block.

#### Scenario: Enter multiline prompt
- **WHEN** user types "Hello"
- **AND** presses `Shift + Enter`
- **AND** types "World"
- **AND** presses `Enter`
- **THEN** Kintsugi submits the prompt as `"Hello\nWorld"` to the LLM runtime

### Requirement: Key handlers SHALL abort active streams and tasks

`Ctrl + C` or `Escape` keypresses during active streaming operations MUST cancel the current operation instead of closing the application.

#### Scenario: Interrupt active LLM response stream
- **WHEN** LLM is currently streaming tokens to the terminal
- **AND** user presses `Ctrl + C` or `Escape`
- **THEN** Kintsugi aborts the underlying network request
- **AND** stops rendering further tokens
- **AND** resets the TUI input prompt to idle state without exiting the CLI process

### Requirement: Layout SHALL dynamically adjust to window resizing

Kintsugi TUI MUST intercept `SIGWINCH` resize events and adjust its layout container dimensions.

#### Scenario: Resize terminal window
- **WHEN** the host terminal is resized by the user
- **THEN** Kintsugi receives a `SIGWINCH` signal
- **AND** recalculates the Ink container height and width
- **AND** re-renders the text frames without duplicate line wraps or overlapping text

### Requirement: Terminal terminal states SHALL be restored on exit

Kintsugi MUST clean up raw terminal modes and restore cursor visibility upon exit.

#### Scenario: Exit Kintsugi safely
- **WHEN** Kintsugi CLI process exits (gracefully or via uncaught error)
- **THEN** Kintsugi executes exit handlers to disable raw mode on stdin
- **AND** enables cursor visibility
- **AND** returns control of the terminal to the parent shell

## Traceability

| Scenario | Test File |
|----------|-----------|
| Enter multiline prompt | `tests/terminal-inputs.test.ts` |
| Interrupt active LLM response stream | `tests/terminal-inputs.test.ts` |
| Resize terminal window | `tests/terminal-inputs.test.ts` |
| Exit Kintsugi safely | `tests/terminal-inputs.test.ts` |

