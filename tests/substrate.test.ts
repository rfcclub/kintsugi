import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadSubstrate } from "../src/substrate/echo.js";

const originalSubstrateEnv = process.env.KINTSUGI_SUBSTRATE;
const tempDirs: string[] = [];

afterEach(() => {
  if (originalSubstrateEnv === undefined) {
    delete process.env.KINTSUGI_SUBSTRATE;
  } else {
    process.env.KINTSUGI_SUBSTRATE = originalSubstrateEnv;
  }

  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function tempFile(content: string): string {
  const dir = mkdtempSync(join(tmpdir(), "kintsugi-substrate-"));
  tempDirs.push(dir);
  const file = join(dir, "substrate.md");
  writeFileSync(file, content, "utf-8");
  return file;
}

describe("Kintsugi substrate", () => {
  it("loads an explicit substrate file", () => {
    const file = tempFile("Kintsugi wakes in the workshop.");

    expect(loadSubstrate({ substrate: file })).toEqual({
      path: file,
      content: "Kintsugi wakes in the workshop.",
    });
  });

  it("loads a directory of markdown files in Echo order", () => {
    const dir = mkdtempSync(join(tmpdir(), "kintsugi-echo-"));
    tempDirs.push(dir);
    writeFileSync(join(dir, "session.md"), "Session tuning", "utf-8");
    writeFileSync(join(dir, "PREFACE.md"), "Echo preface", "utf-8");
    writeFileSync(join(dir, "zzz.md"), "Last note", "utf-8");

    const substrate = loadSubstrate({ substrate: dir });

    expect(substrate?.content.indexOf("Echo preface")).toBeLessThan(
      substrate?.content.indexOf("Session tuning") ?? -1
    );
    expect(substrate?.content).toContain("# Kintsugi Echo: zzz.md");
  });

  it("can be disabled", () => {
    const file = tempFile("Do not load me.");
    process.env.KINTSUGI_SUBSTRATE = file;

    expect(loadSubstrate({ noSubstrate: true })).toBeUndefined();
  });
});
