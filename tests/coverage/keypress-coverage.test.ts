import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  parseKeypressEvent,
  isMultilineChord,
  restoreTerminal,
  setupExitHandlers,
} from "../../src/ui/keypress-parser.js";

// ─── parseKeypressEvent ─────────────────────────────────────────────

describe("parseKeypressEvent", () => {
  describe("empty / falsy input", () => {
    it("returns default for empty string", () => {
      expect(parseKeypressEvent("")).toEqual({
        name: "",
        shift: false,
        meta: false,
        ctrl: false,
      });
    });
  });

  describe("Kitty keyboard protocol CSI sequences", () => {
    it("parses basic enter (codepoint 13) → return", () => {
      const r = parseKeypressEvent("\x1b[13u");
      expect(r.name).toBe("return");
      expect(r.shift).toBe(false);
      expect(r.meta).toBe(false);
      expect(r.ctrl).toBe(false);
    });

    it("parses enter (codepoint 10) → enter (line 31-32)", () => {
      const r = parseKeypressEvent("\x1b[10u");
      expect(r.name).toBe("enter");
      expect(r.shift).toBe(false);
      expect(r.meta).toBe(false);
      expect(r.ctrl).toBe(false);
    });

    it("parses kitty return with shift (modifier 2)", () => {
      const r = parseKeypressEvent("\x1b[13;2u");
      expect(r.name).toBe("return");
      expect(r.shift).toBe(true);
      expect(r.meta).toBe(false);
      expect(r.ctrl).toBe(false);
    });

    it("parses kitty return with alt (modifier 3)", () => {
      const r = parseKeypressEvent("\x1b[13;3u");
      expect(r.name).toBe("return");
      expect(r.shift).toBe(false);
      expect(r.meta).toBe(true);
      expect(r.ctrl).toBe(false);
    });

    it("parses kitty return with ctrl (modifier 5)", () => {
      const r = parseKeypressEvent("\x1b[13;5u");
      expect(r.name).toBe("return");
      expect(r.shift).toBe(false);
      expect(r.meta).toBe(false);
      expect(r.ctrl).toBe(true);
    });

    it("parses kitty return with all modifiers (modifier 8)", () => {
      const r = parseKeypressEvent("\x1b[13;8u");
      expect(r.name).toBe("return");
      expect(r.shift).toBe(true);
      expect(r.meta).toBe(true);
      expect(r.ctrl).toBe(true);
    });

    it("parses kitty sequence with colon-separated sub-parameter", () => {
      const r = parseKeypressEvent("\x1b[13;2:3u");
      expect(r.name).toBe("return");
      expect(r.shift).toBe(true);
    });

    it("parses kitty sequence with trailing semicolon list", () => {
      const r = parseKeypressEvent("\x1b[97;5;1u");
      expect(r.name).toBe("");
      expect(r.ctrl).toBe(true);
    });

    it("parses kitty enter with modifier 1 (maps to 0 after subtract)", () => {
      const r = parseKeypressEvent("\x1b[10;1u");
      expect(r.name).toBe("enter");
      expect(r.shift).toBe(false);
      expect(r.meta).toBe(false);
      expect(r.ctrl).toBe(false);
    });

    it("parses kitty sequence for codepoint 97 (letter a)", () => {
      const r = parseKeypressEvent("\x1b[97u");
      expect(r.name).toBe("");
      expect(r.shift).toBe(false);
      expect(r.meta).toBe(false);
      expect(r.ctrl).toBe(false);
    });
  });

  describe("Alt + Enter / Esc + Enter", () => {
    it("parses Alt+Enter (\\x1b\\r) as return with meta", () => {
      const r = parseKeypressEvent("\x1b\r");
      expect(r.name).toBe("return");
      expect(r.meta).toBe(true);
      expect(r.shift).toBe(false);
      expect(r.ctrl).toBe(false);
    });

    it("parses Alt+Newline (\\x1b\\n) as return with meta", () => {
      const r = parseKeypressEvent("\x1b\n");
      expect(r.name).toBe("return");
      expect(r.meta).toBe(true);
      expect(r.shift).toBe(false);
      expect(r.ctrl).toBe(false);
    });
  });

  describe("Normal Enter / Return", () => {
    it("parses \\r as return", () => {
      const r = parseKeypressEvent("\r");
      expect(r.name).toBe("return");
      expect(r.shift).toBe(false);
      expect(r.meta).toBe(false);
      expect(r.ctrl).toBe(false);
    });

    it("parses \\n as enter", () => {
      const r = parseKeypressEvent("\n");
      expect(r.name).toBe("enter");
      expect(r.shift).toBe(false);
      expect(r.meta).toBe(false);
      expect(r.ctrl).toBe(false);
    });
  });

  describe("Ctrl+C", () => {
    it("parses \\x03 as Ctrl+C", () => {
      const r = parseKeypressEvent("\x03");
      expect(r.name).toBe("c");
      expect(r.ctrl).toBe(true);
      expect(r.shift).toBe(false);
      expect(r.meta).toBe(false);
    });
  });

  describe("Escape", () => {
    it("parses bare escape", () => {
      const r = parseKeypressEvent("\x1b");
      expect(r.name).toBe("escape");
      expect(r.shift).toBe(false);
      expect(r.meta).toBe(false);
      expect(r.ctrl).toBe(false);
    });
  });

  describe("Fallthrough (unknown input)", () => {
    it("returns default for unrecognized single character", () => {
      const r = parseKeypressEvent("a");
      expect(r.name).toBe("");
      expect(r.shift).toBe(false);
      expect(r.meta).toBe(false);
      expect(r.ctrl).toBe(false);
    });

    it("returns default for unrecognized multi-byte string", () => {
      const r = parseKeypressEvent("\x1b[Z");
      expect(r.name).toBe("");
    });

    it("returns default for partial escape sequence", () => {
      const r = parseKeypressEvent("\x1b[");
      expect(r.name).toBe("");
    });

    it("returns default for random bytes", () => {
      const r = parseKeypressEvent("\xff\xfe");
      expect(r.name).toBe("");
    });
  });
});

// ─── isMultilineChord ───────────────────────────────────────────────

describe("isMultilineChord", () => {
  it("returns true for Shift+Return (kitty)", () => {
    const input = "\x1b[13;2u"; // codepoint 13, modifier 2 (shift)
    expect(isMultilineChord(input)).toBe(true);
  });

  it("returns true for Alt+Return (kitty)", () => {
    const input = "\x1b[13;3u"; // codepoint 13, modifier 3 (alt)
    expect(isMultilineChord(input)).toBe(true);
  });

  it("returns true for Alt+Enter (\\x1b\\r)", () => {
    expect(isMultilineChord("\x1b\r")).toBe(true);
  });

  it("returns true for Alt+Newline (\\x1b\\n)", () => {
    expect(isMultilineChord("\x1b\n")).toBe(true);
  });

  it("returns false for plain Enter (\\r)", () => {
    expect(isMultilineChord("\r")).toBe(false);
  });

  it("returns false for plain Newline (\\n)", () => {
    expect(isMultilineChord("\n")).toBe(false);
  });

  it("returns false for non-return key", () => {
    expect(isMultilineChord("a")).toBe(false);
    expect(isMultilineChord("\x03")).toBe(false);
  });

  it("returns false for empty input", () => {
    expect(isMultilineChord("")).toBe(false);
  });
});

// ─── restoreTerminal ────────────────────────────────────────────────

describe("restoreTerminal", () => {
  let origStdin: typeof process.stdin;
  let origStdout: typeof process.stdout;

  beforeEach(() => {
    origStdin = process.stdin;
    origStdout = process.stdout;
  });

  afterEach(() => {
    Object.defineProperty(process, "stdin", { value: origStdin, configurable: true });
    Object.defineProperty(process, "stdout", { value: origStdout, configurable: true });
  });

  it("restores terminal when stdin is a TTY", () => {
    const writes: string[] = [];
    const setRawModeMock = vi.fn();
    const unrefMock = vi.fn();

    Object.defineProperty(process, "stdin", {
      value: {
        isTTY: true,
        setRawMode: setRawModeMock,
        unref: unrefMock,
      },
      configurable: true,
    });
    Object.defineProperty(process, "stdout", {
      value: { write: (s: string) => { writes.push(s); } },
      configurable: true,
    });

    restoreTerminal();

    expect(setRawModeMock).toHaveBeenCalledWith(false);
    expect(unrefMock).toHaveBeenCalled();
    expect(writes).toContain("\u001B[?25h");
  });

  it("restores terminal when setRawMode is available (not TTY)", () => {
    const writes: string[] = [];
    const setRawModeMock = vi.fn();
    const unrefMock = vi.fn();

    Object.defineProperty(process, "stdin", {
      value: {
        isTTY: false,
        setRawMode: setRawModeMock,
        unref: unrefMock,
      },
      configurable: true,
    });
    Object.defineProperty(process, "stdout", {
      value: { write: (s: string) => { writes.push(s); } },
      configurable: true,
    });

    restoreTerminal();

    expect(setRawModeMock).toHaveBeenCalledWith(false);
    expect(unrefMock).toHaveBeenCalled();
  });

  it("skips setRawMode when not available", () => {
    const writes: string[] = [];
    const unrefMock = vi.fn();

    Object.defineProperty(process, "stdin", {
      value: {
        isTTY: false,
        unref: unrefMock,
      },
      configurable: true,
    });
    Object.defineProperty(process, "stdout", {
      value: { write: (s: string) => { writes.push(s); } },
      configurable: true,
    });

    restoreTerminal();

    expect(unrefMock).toHaveBeenCalled();
    expect(writes).toContain("\u001B[?25h");
  });

  it("skips unref when not available", () => {
    const writes: string[] = [];
    const setRawModeMock = vi.fn();

    Object.defineProperty(process, "stdin", {
      value: {
        isTTY: true,
        setRawMode: setRawModeMock,
      },
      configurable: true,
    });
    Object.defineProperty(process, "stdout", {
      value: { write: (s: string) => { writes.push(s); } },
      configurable: true,
    });

    restoreTerminal();

    expect(setRawModeMock).toHaveBeenCalledWith(false);
    expect(writes).toContain("\u001B[?25h");
  });
});

// ─── setupExitHandlers ──────────────────────────────────────────────

describe("setupExitHandlers", () => {
  let origOn: typeof process.on;
  const handlers: Record<string, (...args: unknown[]) => void> = {};

  beforeEach(() => {
    origOn = process.on;
    for (const key of Object.keys(handlers)) {
      delete handlers[key];
    }
    Object.defineProperty(process, "on", {
      value: (event: string, fn: (...args: unknown[]) => void) => {
        handlers[event] = fn;
        return process;
      },
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(process, "on", {
      value: origOn,
      configurable: true,
    });
  });

  it("registers exit, SIGINT, and uncaughtException handlers", () => {
    setupExitHandlers();

    expect(handlers).toHaveProperty("exit");
    expect(handlers).toHaveProperty("SIGINT");
    expect(handlers).toHaveProperty("uncaughtException");
  });

  it("exit handler calls restoreTerminal", () => {
    const writes: string[] = [];
    Object.defineProperty(process, "stdin", {
      value: { isTTY: false },
      configurable: true,
    });
    Object.defineProperty(process, "stdout", {
      value: { write: (s: string) => { writes.push(s); } },
      configurable: true,
    });

    setupExitHandlers();
    handlers.exit();

    expect(writes).toContain("\u001B[?25h");
  });

  it("SIGINT handler calls cleanup and process.exit(0)", () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const writes: string[] = [];
    Object.defineProperty(process, "stdin", {
      value: { isTTY: false },
      configurable: true,
    });
    Object.defineProperty(process, "stdout", {
      value: { write: (s: string) => { writes.push(s); } },
      configurable: true,
    });

    setupExitHandlers();
    handlers.SIGINT();

    expect(writes).toContain("\u001B[?25h");
    expect(exitSpy).toHaveBeenCalledWith(0);
    exitSpy.mockRestore();
  });

  it("uncaughtException handler calls cleanup, logs error, and process.exit(1)", () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const writes: string[] = [];
    Object.defineProperty(process, "stdin", {
      value: { isTTY: false },
      configurable: true,
    });
    Object.defineProperty(process, "stdout", {
      value: { write: (s: string) => { writes.push(s); } },
      configurable: true,
    });

    setupExitHandlers();
    const testErr = new Error("test error");
    handlers.uncaughtException(testErr);

    expect(writes).toContain("\u001B[?25h");
    expect(errorSpy).toHaveBeenCalledWith(testErr);
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
