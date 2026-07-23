export interface KeypressInfo {
  name: string;
  shift: boolean;
  meta: boolean;
  ctrl: boolean;
}

export function parseKeypressEvent(s: string): KeypressInfo {
  const result: KeypressInfo = {
    name: "",
    shift: false,
    meta: false,
    ctrl: false,
  };

  if (!s) return result;

  // 1. Kitty keyboard protocol CSI u
  const kittyMatch = /^\x1b\[(\d+)(?:;(\d+)(?::(\d+))?(?:;([\d:]+))?)?u$/.exec(s);
  if (kittyMatch) {
    const codepoint = parseInt(kittyMatch[1], 10);
    const modifiers = kittyMatch[2] ? Math.max(0, parseInt(kittyMatch[2], 10) - 1) : 0;
    
    // Modifier flags in kitty: shift = 1, alt = 2, ctrl = 4
    result.shift = !!(modifiers & 1);
    result.meta = !!(modifiers & 2);
    result.ctrl = !!(modifiers & 4);

    if (codepoint === 13) {
      result.name = "return";
    } else if (codepoint === 10) {
      result.name = "enter";
    }
    return result;
  }

  // 2. Alt + Enter / Esc + Enter
  if (s === "\x1b\r" || s === "\x1b\n") {
    result.name = "return";
    result.meta = true;
    return result;
  }

  // 3. Normal enter
  if (s === "\r") {
    result.name = "return";
    return result;
  }
  if (s === "\n") {
    result.name = "enter";
    return result;
  }

  // 4. Ctrl + C
  if (s === "\x03") {
    result.name = "c";
    result.ctrl = true;
    return result;
  }

  // 5. Escape
  if (s === "\x1b") {
    result.name = "escape";
    return result;
  }

  return result;
}

export function isMultilineChord(s: string): boolean {
  const parsed = parseKeypressEvent(s);
  return parsed.name === "return" && (parsed.shift || parsed.meta);
}

export function restoreTerminal(): void {
  if (process.stdin.isTTY || typeof process.stdin.setRawMode === "function") {
    try {
      process.stdin.setRawMode(false);
    } catch (_) {}
  }
  if (typeof process.stdin.unref === "function") {
    process.stdin.unref();
  }
  process.stdout.write("\u001B[?25h");
}

export function setupExitHandlers(): void {
  const cleanup = () => {
    restoreTerminal();
  };
  process.on("exit", cleanup);
  process.on("SIGINT", () => {
    cleanup();
    process.exit(0);
  });
  process.on("uncaughtException", (err) => {
    cleanup();
    console.error(err);
    process.exit(1);
  });
}
