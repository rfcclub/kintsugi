import type { RuntimeEvent } from "../protocol/events.js";

export function mapHttpError(status: number, apiKey: string): RuntimeEvent {
  if (status === 401 || status === 403) {
    return { type: "turn.failed", message: "Authentication failed" };
  }
  if (status === 429) {
    return { type: "turn.failed", message: "Rate limited" };
  }
  if (status >= 500) {
    return { type: "turn.failed", message: `Provider error: ${status}` };
  }
  return {
    type: "turn.failed",
    message: redactApiKey(`Provider request failed: ${status}`, apiKey),
  };
}

export function mapNetworkError(error: unknown, apiKey: string): RuntimeEvent {
  if (error instanceof DOMException && error.name === "AbortError") {
    return { type: "turn.failed", message: "Request timed out" };
  }

  const message = error instanceof Error ? error.message : String(error);
  return {
    type: "turn.failed",
    message: redactApiKey(`Network error: ${message}`, apiKey),
  };
}

export function redactApiKey(message: string, apiKey: string): string {
  if (!apiKey) {
    return message;
  }
  return message.split(apiKey).join("[REDACTED]");
}
