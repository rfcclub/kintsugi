import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseArgs } from "../src/cli/args.js";
import { renderRememberLines } from "../src/ui/views/RememberView.js";

describe("memory CLI args and rendering", () => {
  it("parses remember filters", () => {
    const args = parseArgs(["remember", "--kind", "learn", "--actor", "external", "--limit", "5"]);

    expect(args.rememberKind).toBe("learn");
    expect(args.rememberActor).toBe("external");
    expect(args.rememberLimit).toBe(5);
  });

  it("renders filtered companion runtime learn events", () => {
    const dir = mkdtempSync(join(tmpdir(), "kintsugi-cli-memory-"));
    writeFileSync(
      join(dir, "ops.log"),
      [
        JSON.stringify({ id: "1", kind: "learn", actor: "external", payload: { key: "tone", value: "warm" }, at: "2026-05-23T10:00:00.000Z" }),
        JSON.stringify({ id: "2", kind: "note", actor: "kintsugi", payload: { text: "local" }, at: "2026-05-23T10:01:00.000Z" }),
      ].join("\n") + "\n",
      "utf-8"
    );

    const lines = renderRememberLines({
      memoryDir: dir,
      kind: "learn",
      actor: "external",
      limit: 10,
    });

    expect(lines.join("\n")).toContain("LEARN external");
    expect(lines.join("\n")).toContain('"key":"tone"');
    expect(lines.join("\n")).toContain('"value":"warm"');
    expect(lines.join("\n")).not.toContain("local");
  });

  it("renders reconstructed learned facts", () => {
    const dir = mkdtempSync(join(tmpdir(), "kintsugi-cli-memory-"));
    writeFileSync(
      join(dir, "ops.log"),
      JSON.stringify({ id: "1", kind: "learn", actor: "external", payload: { key: "tone", value: "warm" }, at: "2026-05-23T10:00:00.000Z" }) + "\n",
      "utf-8"
    );

    const lines = renderRememberLines({ memoryDir: dir, learned: true });
    expect(lines).toContain("tone: warm");
  });
});
