import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.KINTSUGI_MEMORY_DIR ??= mkdtempSync(join(tmpdir(), "kintsugi-vitest-memory-"));
process.env.KINTSUGI_WORKSPACE ??= join(
  mkdtempSync(join(tmpdir(), "kintsugi-vitest-workspace-")),
  "missing"
);
