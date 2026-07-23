import { execSync } from "node:child_process";

export function isGitActive(cwd: string = process.cwd()): boolean {
  try {
    const res = execSync("git rev-parse --is-inside-work-tree", { cwd, stdio: "pipe" });
    return res.toString().trim() === "true";
  } catch {
    return false;
  }
}

export function createGitSnapshot(turnIndex: number, cwd: string = process.cwd()): string | null {
  if (!isGitActive(cwd)) {
    return null;
  }
  try {
    execSync("git add -A", { cwd, stdio: "pipe" });
    execSync(`git commit --allow-empty -m "kintsugi-turn-snapshot: ${turnIndex}"`, { cwd, stdio: "pipe" });
    const hash = execSync("git rev-parse HEAD", { cwd, stdio: "pipe" }).toString().trim();
    return hash;
  } catch (err) {
    console.error("Failed to create git snapshot:", err);
    return null;
  }
}

export function rollbackToTurn(turnIndex: number, cwd: string = process.cwd()): void {
  if (!isGitActive(cwd)) {
    throw new Error("Git is not active");
  }

  // 1. Query git log for the commit hash with the matching turnIndex
  let commitHash: string;
  try {
    commitHash = execSync(`git log --grep="kintsugi-turn-snapshot: ${turnIndex}" --format="%H" -n 1`, {
      cwd,
      stdio: "pipe",
    })
      .toString()
      .trim();
  } catch (err) {
    throw new Error(`Failed to query git log for turn ${turnIndex}`);
  }

  if (!commitHash) {
    throw new Error(`No git snapshot found for turn ${turnIndex}`);
  }

  // 2. Check git status for uncommitted changes
  let status: string;
  try {
    status = execSync("git status --porcelain", { cwd, stdio: "pipe" }).toString().trim();
  } catch (err) {
    throw new Error(`Failed to check git status: ${(err as Error).message}`);
  }

  if (status.length > 0) {
    throw new Error("Uncommitted manual changes risk being lost");
  }

  // 3. Reset hard to the commit hash
  try {
    execSync(`git reset --hard ${commitHash}`, { cwd, stdio: "pipe" });
  } catch (err) {
    throw new Error(`Failed to perform git reset to turn ${turnIndex}`);
  }
}
