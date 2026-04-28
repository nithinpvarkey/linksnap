// ─── Types ────────────────────────────────────────────────────────────────────

export type SseEventType = 'image' | 'title' | 'tag' | 'summary' | 'error' | 'done'

interface SsePayloads {
  image:   { imageUrl: string }
  title:   { title: string }
  tag:     { tag: string }
  summary: { token: string }
  error:   { section: string; message: string }
  done:    Record<string, never>
}

/**
 * The object returned by createSseStream.
 * Pass readable to the HTTP response.
 * Call sendEvent once per result as each agent finishes.
 * Call writeRaw for SSE comments — used internally by createHeartbeat.
 * Call close when all agents are done — sends done event and ends the stream.
 */
export interface SseStream {
  readable:  ReadableStream<Uint8Array>
  sendEvent<T extends SseEventType>(type: T, data: SsePayloads[T]): Promise<void>
  writeRaw(text: string): Promise<void>
  close(): void
}

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * HTTP headers required on every SSE response.
 * Spread into the Response constructor in the API route.
 * X-Accel-Buffering: no tells nginx not to buffer the stream.
 */
export const SSE_HEADERS: Record<string, string> = {
  'Content-Type':      'text/event-stream',
  'Cache-Control':     'no-cache',
  'Connection':        'keep-alive',
  'X-Accel-Buffering': 'no',
}

// ─── Private helpers ─────────────────────────────────────────────────────────

const encoder = new TextEncoder()

function formatSseEvent<T extends SseEventType>(type: T, data: SsePayloads[T]): string {
  return `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`
}

// ─── Exported functions ───────────────────────────────────────────────────────

/**
 * Creates an SSE stream for sending card results to the browser progressively.
 * Uses TransformStream internally — the writable side's writer exposes
 * desiredSize and ready, which are the Web Streams API equivalent of
 * Node's res.write() return value and drain event for backpressure detection.
 *
 * sendEvent waits for the client to drain its buffer before writing if
 * desiredSize is null or <= 0 — prevents memory buildup on slow connections.
 */
export function createSseStream(): SseStream {
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>()
  const writer = writable.getWriter()

  async function writeChunk(chunk: Uint8Array): Promise<void> {
    // desiredSize null  → stream is closed or errored
    // desiredSize <= 0  → client buffer full — wait for drain before writing
    if (writer.desiredSize === null || writer.desiredSize <= 0) {
      await writer.ready
    }
    await writer.write(chunk)
  }

  async function sendEvent<T extends SseEventType>(
    type: T,
    data: SsePayloads[T],
  ): Promise<void> {
    await writeChunk(encoder.encode(formatSseEvent(type, data)))
  }

  async function writeRaw(text: string): Promise<void> {
    await writeChunk(encoder.encode(text))
  }

  function close(): void {
    const chunk = encoder.encode(formatSseEvent('done', {}))
    void writer.write(chunk).then(() => writer.close())
  }

  return { readable, sendEvent, writeRaw, close }
}

/**
 * Sends an SSE comment (": heartbeat\n\n") every 10 seconds to keep the
 * connection alive through proxies and load balancers that close idle connections.
 * Returns a cleanup function — call it in a finally block when the stream closes.
 */
export function createHeartbeat(stream: SseStream): () => void {
  const id = setInterval(() => {
    void stream.writeRaw(': heartbeat\n\n')
  }, 10_000)
  return () => clearInterval(id)
}
