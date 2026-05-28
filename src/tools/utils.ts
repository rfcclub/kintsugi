import type { ToolResult } from "./tool.js";

export const OUTPUT_TRUNCATION_BYTES = 10 * 1024;

export function toolCallIdFrom(args: Record<string, unknown>): string {
  return typeof args.toolCallId === "string" ? args.toolCallId : "";
}

export function stringArg(args: Record<string, unknown>, name: string): string {
  const value = args[name];
  if (typeof value !== "string") {
    throw new Error(`${name} must be a string`);
  }
  return value;
}

export function optionalStringArg(
  args: Record<string, unknown>,
  name: string
): string | undefined {
  const value = args[name];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new Error(`${name} must be a string`);
  }
  return value;
}

export function optionalNumberArg(
  args: Record<string, unknown>,
  name: string
): number | undefined {
  const value = args[name];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${name} must be a number`);
  }
  return value;
}

export function ok(toolCallId: string, output: string): ToolResult {
  return { toolCallId, output, isError: false };
}

export function fail(toolCallId: string, error: unknown): ToolResult {
  return {
    toolCallId,
    output: error instanceof Error ? error.message : String(error),
    isError: true,
  };
}

export function requireAllowed(permission: string): void {
  if (permission !== "allow") {
    throw new Error("Permission denied");
  }
}

export function truncateOutput(output: string): string {
  if (Buffer.byteLength(output, "utf8") <= OUTPUT_TRUNCATION_BYTES) {
    return output;
  }

  const buffer = Buffer.from(output, "utf8");
  return `${buffer.subarray(0, OUTPUT_TRUNCATION_BYTES).toString("utf8")}\n[output truncated at 10 KB]`;
}
