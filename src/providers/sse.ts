export interface SseEvent {
  event?: string;
  data: unknown;
}

export async function* readSseEvents(
  body: ReadableStream<Uint8Array> | null
): AsyncIterable<SseEvent> {
  if (!body) {
    return;
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });

    let boundary = findEventBoundary(buffer);
    while (boundary >= 0) {
      const raw = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + eventBoundaryLength(buffer, boundary));
      const event = parseSseEvent(raw);
      if (event) {
        yield event;
      }
      boundary = findEventBoundary(buffer);
    }
  }

  buffer += decoder.decode();
  const event = parseSseEvent(buffer);
  if (event) {
    yield event;
  }
}

export function parseSseEvent(raw: string): SseEvent | undefined {
  const lines = raw.split(/\r?\n/);
  let eventName: string | undefined;
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith("event:")) {
      eventName = line.slice("event:".length).trim();
    }
    if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).trimStart());
    }
  }

  if (dataLines.length === 0) {
    return undefined;
  }

  const data = dataLines.join("\n");
  if (data === "[DONE]") {
    return { event: eventName, data };
  }

  try {
    return { event: eventName, data: JSON.parse(data) };
  } catch {
    return undefined;
  }
}

function findEventBoundary(buffer: string): number {
  const lf = buffer.indexOf("\n\n");
  const crlf = buffer.indexOf("\r\n\r\n");
  if (lf < 0) {
    return crlf;
  }
  if (crlf < 0) {
    return lf;
  }
  return Math.min(lf, crlf);
}

function eventBoundaryLength(buffer: string, boundary: number): number {
  return buffer.slice(boundary, boundary + 4) === "\r\n\r\n" ? 4 : 2;
}
