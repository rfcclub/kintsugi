import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ResolvedConfig } from "../src/config/config.js";
import { defaultPermissionConfig } from "../src/runtime/permissions.js";
import { bootRuntime } from "../src/runtime/runtime.js";
import { SessionIndex } from "../src/store/index.js";
import { SessionWriter } from "../src/store/sessions.js";
import {
  createNewSessionRuntime,
  resumeSessionRuntime,
  startFreshSessionRuntime,
} from "../src/ui/commands/session-actions.js";

const tempDirs: string[] = [];

beforeEach(() => {
  vi.stubEnv("KINTSUGI_MEMORY_DIR", tempRoot());
});

afterEach(() => {
  vi.unstubAllEnvs();
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("session command actions", () => {
  it("starts a fresh runtime with a session writer and index entry", () => {
    const root = tempRoot();

    const runtime = startFreshSessionRuntime(config(), {
      stores: {
        writer: {
          root,
          id: "kng-20260522t100000-a111",
          startedAt: new Date(2026, 4, 22, 10, 0, 0),
          syncFile: () => undefined,
        },
        index: { root, syncFile: () => undefined },
      },
    });

    expect(runtime.sessionId).toBe("kng-20260522t100000-a111");
    expect(runtime.provider).toBe("mock");
    expect(runtime.model).toBe("mock-model");
    expect(new SessionIndex({ root }).list()).toMatchObject([
      {
        id: "kng-20260522t100000-a111",
        endedAt: null,
        provider: "mock",
        model: "mock-model",
      },
    ]);
  });

  it("records provider-level model when top-level model is unset", () => {
    const root = tempRoot();

    const runtime = startFreshSessionRuntime(
      {
        ...config(),
        model: undefined,
        providerSettings: { model: "provider-default" },
      },
      {
        stores: {
          writer: {
            root,
            id: "kng-20260522t100100-a112",
            startedAt: new Date(2026, 4, 22, 10, 1, 0),
            syncFile: () => undefined,
          },
          index: { root, syncFile: () => undefined },
        },
      }
    );

    expect(runtime.model).toBe("provider-default");
    expect(new SessionIndex({ root }).list()).toMatchObject([
      {
        id: "kng-20260522t100100-a112",
        model: "provider-default",
      },
    ]);
  });

  it("closes and indexes the current writer before creating /new runtime", () => {
    const root = tempRoot();
    const currentWriter = new SessionWriter({
      root,
      id: "kng-20260522t100000-a111",
      startedAt: new Date(2026, 4, 22, 10, 0, 0),
      syncFile: () => undefined,
    });
    const current = bootRuntime({ noSubstrate: true, sessionWriter: currentWriter });
    current.provider = "mock";
    current.model = "old-model";
    current.sessionId = currentWriter.id;
    currentWriter.start({ provider: "mock", model: "old-model" });
    new SessionIndex({ root, syncFile: () => undefined }).appendStart({
      id: currentWriter.id,
      startedAt: currentWriter.startedAt.toISOString(),
      provider: "mock",
      model: "old-model",
    });
    current.prompts.push({ role: "user", text: "old", at: "2026-05-22T10:00:01.000Z" });

    const result = createNewSessionRuntime(current, config(), {
      stores: {
        writer: {
          root,
          id: "kng-20260522t100500-b222",
          startedAt: new Date(2026, 4, 22, 10, 5, 0),
          syncFile: () => undefined,
        },
        index: { root, syncFile: () => undefined },
      },
    });

    expect(result.previousEnd?.reason).toBe("new_session");
    expect(current.sessionWriter).toBeUndefined();
    expect(() => currentWriter.message("user", "after close")).toThrow("Session writer is closed");
    expect(result.runtime.sessionId).toBe("kng-20260522t100500-b222");
    expect(result.runtime.prompts).toEqual([]);
    expect(new SessionIndex({ root }).list()).toMatchObject([
      { id: "kng-20260522t100500-b222", endedAt: null, model: "mock-model" },
      { id: "kng-20260522t100000-a111", model: "old-model", messageCount: 1 },
    ]);
  });

  it("closes current writer and returns a replayed runtime for /resume", () => {
    const root = tempRoot();
    const replayedWriter = new SessionWriter({
      root,
      id: "kng-20260521t090000-c333",
      startedAt: new Date(2026, 4, 21, 9, 0, 0),
      syncFile: () => undefined,
    });
    replayedWriter.start({ provider: "mock", model: "then" });
    replayedWriter.message("user", "remember this", "2026-05-21T09:00:01.000Z");
    replayedWriter.message("assistant", "remembered", "2026-05-21T09:00:02.000Z");
    replayedWriter.close();

    const currentWriter = new SessionWriter({
      root,
      id: "kng-20260522t100000-a111",
      startedAt: new Date(2026, 4, 22, 10, 0, 0),
      syncFile: () => undefined,
    });
    const current = bootRuntime({ noSubstrate: true, sessionWriter: currentWriter });
    current.provider = "mock";
    current.model = "current";
    currentWriter.start({ provider: "mock", model: "current" });

    const result = resumeSessionRuntime(
      current,
      { root, id: replayedWriter.id },
      config(),
      {
        stores: {
          writer: {
            root,
            id: "kng-20260522t101000-d444",
            startedAt: new Date(2026, 4, 22, 10, 10, 0),
            syncFile: () => undefined,
          },
          index: { root, syncFile: () => undefined },
        },
      }
    );

    expect(result.previousEnd?.reason).toBe("resume_session");
    expect(result.runtime.sessionId).toBe("kng-20260522t101000-d444");
    expect(result.runtime.prompts.map((message) => [message.role, message.text])).toEqual([
      ["user", "remember this"],
      ["assistant", "remembered"],
    ]);
    expect(result.runtime.provider).toBe("mock");
    expect(result.runtime.model).toBe("mock-model");
  });
});

function config(): ResolvedConfig {
  return {
    provider: "mock",
    model: "mock-model",
    noSubstrate: true,
    providerSettings: {},
    permissions: defaultPermissionConfig,
    sources: [],
  };
}

function tempRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), "kintsugi-session-actions-"));
  tempDirs.push(dir);
  return dir;
}
