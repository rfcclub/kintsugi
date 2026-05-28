import * as fs from "fs";
import * as os from "os";
import * as path from "path";

export const DEFAULT_SUBSTRATE_PATH = path.join(
  os.homedir(),
  ".config",
  "kintsugi",
  "substrate"
);

const PREFERRED_ECHO_FILES = [
  "PREFACE.md",
  "resonance.md",
  "REFLECTION.md",
  "timing.md",
  "repertoire.md",
  "session.md",
];

export interface SubstrateOptions {
  substrate?: string;
  noSubstrate?: boolean;
}

export interface LoadedSubstrate {
  path: string;
  content: string;
}

export function resolveSubstratePath(options: SubstrateOptions = {}): string | undefined {
  if (options.noSubstrate) {
    return undefined;
  }
  return options.substrate || process.env.KINTSUGI_SUBSTRATE || DEFAULT_SUBSTRATE_PATH;
}

export function loadSubstrate(options: SubstrateOptions = {}): LoadedSubstrate | undefined {
  const substratePath = resolveSubstratePath(options);
  if (!substratePath) {
    return undefined;
  }

  if (!fs.existsSync(substratePath)) {
    if (options.substrate || process.env.KINTSUGI_SUBSTRATE) {
      throw new Error(`Substrate file not found: ${substratePath}`);
    }
    return undefined;
  }

  const content = readSubstrateContent(substratePath);
  if (!content) {
    return undefined;
  }

  return {
    path: substratePath,
    content,
  };
}

function readSubstrateContent(substratePath: string): string {
  const stat = fs.statSync(substratePath);
  if (stat.isFile()) {
    return fs.readFileSync(substratePath, "utf-8").trim();
  }

  if (!stat.isDirectory()) {
    throw new Error(`Substrate path is neither a file nor directory: ${substratePath}`);
  }

  const available = new Set(
    fs
      .readdirSync(substratePath, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
      .map((entry) => entry.name)
  );

  const preferred = PREFERRED_ECHO_FILES.filter((file) => available.delete(file));
  const remaining = [...available].sort((a, b) => a.localeCompare(b));
  const files = [...preferred, ...remaining];

  return files
    .map((file) => {
      const filePath = path.join(substratePath, file);
      const content = fs.readFileSync(filePath, "utf-8").trim();
      return [`# Kintsugi Echo: ${file}`, "", content].join("\n");
    })
    .join("\n\n---\n\n")
    .trim();
}
