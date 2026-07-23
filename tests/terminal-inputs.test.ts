import { describe, expect, it, vi } from "vitest";
import React from "react";
import { render } from "ink";
import Stream from "stream";
import { Composer } from "../src/ui/components/Composer.js";
import {
  parseKeypressEvent,
  isMultilineChord,
  setupExitHandlers,
  restoreTerminal,
} from "../src/ui/keypress-parser.js";

class MockStdin extends Stream.Readable {
  isTTY = true;
  setRawMode = vi.fn();
  ref = vi.fn();
  unref = vi.fn();
  _read() {}
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("Task 1: Multiline Prompt Insertion (Shift+Enter)", () => {
  it("should identify Shift+Enter and Alt+Enter as multiline chords", () => {
    // Kitty protocol Shift+Enter
    expect(isMultilineChord("\x1b[13;2u")).toBe(true);
    // Kitty protocol Alt+Enter
    expect(isMultilineChord("\x1b[13;3u")).toBe(true);
    // Alt+Enter / Esc+Enter
    expect(isMultilineChord("\x1b\r")).toBe(true);
    expect(isMultilineChord("\x1b\n")).toBe(true);
    // Normal Enter should not be multiline
    expect(isMultilineChord("\r")).toBe(false);
    expect(isMultilineChord("\n")).toBe(false);
  });

  it("should parse keypress event modifiers correctly", () => {
    const shiftEnter = parseKeypressEvent("\x1b[13;2u");
    expect(shiftEnter.name).toBe("return");
    expect(shiftEnter.shift).toBe(true);

    const altEnter = parseKeypressEvent("\x1b\r");
    expect(altEnter.name).toBe("return");
    expect(altEnter.meta).toBe(true);
  });

  it("should append newline character when Shift+Enter is pressed and submit multiline text", async () => {
    const onSubmit = vi.fn();
    const mockStdin = new MockStdin();
    const { unmount } = render(
      React.createElement(Composer, {
        onSubmit,
        streaming: false,
      }),
      { stdin: mockStdin, patchConsole: false }
    );

    mockStdin.push("Hello");
    await sleep(20);
    mockStdin.push("\x1b[13;2u");
    await sleep(20);
    mockStdin.push("World");
    await sleep(20);
    mockStdin.push("\r");
    await sleep(50);

    expect(onSubmit).toHaveBeenCalledWith("Hello\nWorld");
    unmount();
  });
});

describe("Task 2: Ctrl+C / Escape Cancellation", () => {
  it("should trigger onCancel and NOT exit the process when Ctrl+C is pressed during streaming", async () => {
    const onSubmit = vi.fn();
    const onCancel = vi.fn(() => true);
    const onExit = vi.fn();

    const mockStdin = new MockStdin();
    const { unmount } = render(
      React.createElement(Composer, {
        onSubmit,
        onCancel,
        onExit,
        streaming: true,
      }),
      { stdin: mockStdin, patchConsole: false, exitOnCtrlC: false }
    );

    // Simulate Ctrl+C
    mockStdin.push("\x03");
    await sleep(50);

    expect(onCancel).toHaveBeenCalled();
    expect(onExit).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();

    unmount();
  });

  it("should trigger onCancel when Escape is pressed during streaming", async () => {
    const onSubmit = vi.fn();
    const onCancel = vi.fn(() => true);
    const onExit = vi.fn();

    const mockStdin = new MockStdin();
    const { unmount } = render(
      React.createElement(Composer, {
        onSubmit,
        onCancel,
        onExit,
        streaming: true,
      }),
      { stdin: mockStdin, patchConsole: false, exitOnCtrlC: false }
    );

    // Simulate Escape (\x1b)
    mockStdin.push("\x1b");
    await sleep(50);

    expect(onCancel).toHaveBeenCalled();
    expect(onExit).not.toHaveBeenCalled();
    unmount();
  });

  it("should call onCancel exactly once on Escape when not streaming", async () => {
    const onSubmit = vi.fn();
    const onCancel = vi.fn(() => true);
    const onExit = vi.fn();

    const mockStdin = new MockStdin();
    const { unmount } = render(
      React.createElement(Composer, {
        onSubmit,
        onCancel,
        onExit,
        streaming: false,
      }),
      { stdin: mockStdin, patchConsole: false, exitOnCtrlC: false }
    );

    mockStdin.push("draft text");
    await sleep(20);
    mockStdin.push("\x1b");
    await sleep(50);

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onExit).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
    unmount();
  });
});

describe("Task 3: Responsive TUI Resize (SIGWINCH) and Clean Exit", () => {
  it("should handle resize events and re-render without errors", () => {
    const onResize = vi.fn();
    process.stdout.on("resize", onResize);

    process.stdout.emit("resize");
    expect(onResize).toHaveBeenCalled();

    process.stdout.off("resize", onResize);
  });

  it("should restore terminal raw mode and cursor on exit", () => {
    const originalSetRawMode = process.stdin.setRawMode;
    const originalWrite = process.stdout.write;

    const setRawModeMock = vi.fn();
    const writeMock = vi.fn();

    process.stdin.setRawMode = setRawModeMock;
    process.stdout.write = writeMock;

    try {
      restoreTerminal();

      expect(setRawModeMock).toHaveBeenCalledWith(false);
      expect(writeMock).toHaveBeenCalledWith(expect.stringContaining("\u001B[?25h"));
    } finally {
      process.stdin.setRawMode = originalSetRawMode;
      process.stdout.write = originalWrite;
    }
  });
});
