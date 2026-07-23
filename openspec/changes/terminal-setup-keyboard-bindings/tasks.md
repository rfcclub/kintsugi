# Implementation Plan: terminal-setup-keyboard-bindings

## Preparation

- [ ] Review spec scenarios for terminal-setup-keyboard-bindings
- [ ] Review design.md test strategy

## Tasks

### Task 1: Stdin Raw Mode keypress parser and newline injections

**Files:**
- Create: `src/ui/keypress-parser.ts`
- Test: `tests/terminal-inputs.test.ts`

- [ ] **Step 1: Write the failing test**
  Verify raw escape chords map Shift+Enter to newline instead of submitting text.
- [ ] **Step 2: Write minimal implementation**
  Configure stdin raw mode and parse chords.
- [ ] **Step 3: Commit**

### Task 2: Implement execution cancellation on Ctrl+C/Escape

**Files:**
- Modify: `src/runtime/loop.ts`
- Test: `tests/terminal-inputs.test.ts`

- [ ] **Step 1: Write the failing test**
  Verify Escape/Ctrl+C calls abort signal on active LLM fetch stream.
- [ ] **Step 2: Write minimal implementation**
  Add AbortController propagation during tool/stream run.
- [ ] **Step 3: Commit**

### Task 3: Handle terminal resize dynamically

**Files:**
- Modify: `src/ui/tui.ts`
- Test: `tests/terminal-inputs.test.ts`

- [ ] **Step 1: Write the failing test**
  Verify resize event (SIGWINCH) recalculates dimensions without throwing exceptions.
- [ ] **Step 2: Write minimal implementation**
  Subscribe to process.stdout 'resize' and trigger frame re-renders.
- [ ] **Step 3: Commit**

## Verification

- [ ] All scenarios passing (coverage = 100%)
- [ ] `.traceability.yaml` updated
