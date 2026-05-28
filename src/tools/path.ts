import { access, realpath, stat } from "node:fs/promises";
import path from "node:path";

export interface ResolvedPath {
  requestedPath: string;
  absolutePath: string;
  realPath: string;
  workspaceRoot: string;
}

export class PathValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PathValidationError";
  }
}

export async function resolveAndValidate(
  requestedPath: string,
  workspaceRoots: string[],
  workingDir = process.cwd()
): Promise<ResolvedPath> {
  if (typeof requestedPath !== "string" || requestedPath.length === 0) {
    throw new PathValidationError("Path is required");
  }
  if (workspaceRoots.length === 0) {
    throw new PathValidationError("No workspace roots are configured");
  }

  const rootRecords = await Promise.all(
    workspaceRoots.map(async (root) => {
      const absoluteRoot = path.resolve(root);
      return {
        input: root,
        absolute: absoluteRoot,
        real: await realpath(absoluteRoot),
      };
    })
  );

  const base = path.isAbsolute(requestedPath)
    ? requestedPath
    : path.resolve(workingDir, requestedPath);
  const absolutePath = path.resolve(base);
  const realTarget = await realpathForValidation(absolutePath);

  const containingRoot = rootRecords.find((root) => isInside(root.real, realTarget));
  if (!containingRoot) {
    throw new PathValidationError("Path is outside the workspace roots");
  }

  return {
    requestedPath,
    absolutePath,
    realPath: realTarget,
    workspaceRoot: containingRoot.real,
  };
}

export function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

async function realpathForValidation(absolutePath: string): Promise<string> {
  try {
    await access(absolutePath);
    return realpath(absolutePath);
  } catch {
    const parent = path.dirname(absolutePath);
    const parentReal = await existingParentRealpath(parent);
    return path.join(parentReal, path.basename(absolutePath));
  }
}

async function existingParentRealpath(directory: string): Promise<string> {
  try {
    const directoryStat = await stat(directory);
    if (!directoryStat.isDirectory()) {
      throw new PathValidationError("Path parent is not a directory");
    }
    return realpath(directory);
  } catch (error) {
    if (error instanceof PathValidationError) {
      throw error;
    }

    const parent = path.dirname(directory);
    if (parent === directory) {
      throw new PathValidationError("Path parent does not exist");
    }
    const parentReal = await existingParentRealpath(parent);
    return path.join(parentReal, path.basename(directory));
  }
}
