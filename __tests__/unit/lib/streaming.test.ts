// Unit tests for lib/streaming.ts — 21 tests across 6 groups.
//
// TransformStream, ReadableStream, and TextDecoder are available globally in
// Node 25 — no mocking required for stream primitives.
// SSE content is verified by consuming chunks from the readable side directly.
// createHeartbeat tests use jest.useFakeTimers() to control setInterval.

import {
  SSE_HEADERS,
  createSseStream,
  createHeartbeat,
} from '../../../lib/streaming'

// ─── Helper ───────────────────────────────────────────────────────────────────

const decoder = new TextDecoder()

/**
 * Reads exactly one chunk from a ReadableStream, releases the lock, and
 * returns the decoded string. Each sendEvent / writeRaw call writes one
 * chunk, so this captures exactly one event's worth of output.
 *
 * IMPORTANT: must be run concurrently with the write via Promise.all.
 * TransformStream defaults to readableHighWaterMark: 0, so writer.write()
 * blocks until the reader signals capacity. Awaiting the write first then
 * reading deadlocks — both sides would be waiting on each other forever.
 */
async function readOneChunk(readable: ReadableStream<Uint8Array>): Promise<string> {
  const reader = readable.getReader()
  const { value } = await reader.read()
  reader.releaseLock()
  return value !== undefined ? decoder.decode(value) : ''
}

// ═════════════════════════════════════════════════════════════════════════════
// SSE_HEADERS
// ═════════════════════════════════════════════════════════════════════════════

describe('SSE_HEADERS', () => {

  describe('Group 1 — HTTP headers required for every SSE response', () => {

    it('should contain exactly 4 headers', () => {
      // Arrange / Act: access exported constant — no setup needed
      // Assert
      expect(Object.keys(SSE_HEADERS)).toHaveLength(4)
    })

    it('should set Content-Type to text/event-stream', () => {
      // Arrange / Act: access exported constant — no setup needed
      // Assert
      expect(SSE_HEADERS['Content-Type']).toBe('text/event-stream')
    })

    it('should set Cache-Control to no-cache', () => {
      // Arrange / Act: access exported constant — no setup needed
      // Assert
      expect(SSE_HEADERS['Cache-Control']).toBe('no-cache')
    })

    it('should set Connection to keep-alive', () => {
      // Arrange / Act: access exported constant — no setup needed
      // Assert
      expect(SSE_HEADERS['Connection']).toBe('keep-alive')
    })

    it('should set X-Accel-Buffering to no', () => {
      // Arrange / Act: access exported constant — no setup needed
      // Assert
      expect(SSE_HEADERS['X-Accel-Buffering']).toBe('no')
    })

  })

})

// ═════════════════════════════════════════════════════════════════════════════
// createSseStream — return shape
// ═════════════════════════════════════════════════════════════════════════════

describe('createSseStream', () => {

  describe('Group 2 — return shape', () => {

    it('should return an object with readable, sendEvent, writeRaw, and close', () => {
      // Arrange
      const stream = createSseStream()
      // Act / Assert: verify all four properties exist with correct types
      expect(typeof stream.readable).toBe('object')
      expect(typeof stream.sendEvent).toBe('function')
      expect(typeof stream.writeRaw).toBe('function')
      expect(typeof stream.close).toBe('function')
    })

    it('should return a ReadableStream instance as readable', () => {
      // Arrange
      const { readable } = createSseStream()
      // Assert
      expect(readable).toBeInstanceOf(ReadableStream)
    })

  })

})

// ═════════════════════════════════════════════════════════════════════════════
// sendEvent
// ═════════════════════════════════════════════════════════════════════════════

describe('sendEvent', () => {

  describe('Group 3 — formats events correctly and writes to the stream', () => {

    it('should write a correctly formatted image event to the stream', async () => {
      // Arrange
      const { readable, sendEvent } = createSseStream()
      // Act: concurrent — read must run alongside write to resolve backpressure
      const [, text] = await Promise.all([
        sendEvent('image', { imageUrl: 'https://example.com/img.png' }),
        readOneChunk(readable),
      ])
      // Assert: full SSE wire format — event line, data line, blank line terminator
      expect(text).toBe('event: image\ndata: {"imageUrl":"https://example.com/img.png"}\n\n')
    })

    it('should write a correctly formatted title event to the stream', async () => {
      // Arrange
      const { readable, sendEvent } = createSseStream()
      // Act
      const [, text] = await Promise.all([
        sendEvent('title', { title: 'Test Page' }),
        readOneChunk(readable),
      ])
      // Assert
      expect(text).toBe('event: title\ndata: {"title":"Test Page"}\n\n')
    })

    it('should write a correctly formatted tag event to the stream', async () => {
      // Arrange
      const { readable, sendEvent } = createSseStream()
      // Act
      const [, text] = await Promise.all([
        sendEvent('tag', { tag: 'technology' }),
        readOneChunk(readable),
      ])
      // Assert
      expect(text).toBe('event: tag\ndata: {"tag":"technology"}\n\n')
    })

    it('should write a correctly formatted summary event to the stream', async () => {
      // Arrange
      const { readable, sendEvent } = createSseStream()
      // Act
      const [, text] = await Promise.all([
        sendEvent('summary', { token: 'Hello' }),
        readOneChunk(readable),
      ])
      // Assert
      expect(text).toBe('event: summary\ndata: {"token":"Hello"}\n\n')
    })

    it('should write a correctly formatted error event to the stream', async () => {
      // Arrange
      const { readable, sendEvent } = createSseStream()
      // Act
      const [, text] = await Promise.all([
        sendEvent('error', { section: 'summary', message: 'AI failed' }),
        readOneChunk(readable),
      ])
      // Assert
      expect(text).toBe('event: error\ndata: {"section":"summary","message":"AI failed"}\n\n')
    })

    it('should write a correctly formatted done event with an empty data object', async () => {
      // Arrange
      const { readable, sendEvent } = createSseStream()
      // Act
      const [, text] = await Promise.all([
        sendEvent('done', {}),
        readOneChunk(readable),
      ])
      // Assert
      expect(text).toBe('event: done\ndata: {}\n\n')
    })

  })

})

// ═════════════════════════════════════════════════════════════════════════════
// writeRaw
// ═════════════════════════════════════════════════════════════════════════════

describe('writeRaw', () => {

  describe('Group 4 — writes text to the stream with no formatting', () => {

    it('should write arbitrary raw text to the stream exactly as-is — no event or data prefix added', async () => {
      // Arrange
      const { readable, writeRaw } = createSseStream()
      // Act
      const [, text] = await Promise.all([
        writeRaw('hello world'),
        readOneChunk(readable),
      ])
      // Assert: content is unmodified — no "event:" or "data:" wrapping
      expect(text).toBe('hello world')
    })

    it('should write the SSE heartbeat comment string exactly as-is', async () => {
      // Arrange
      const { readable, writeRaw } = createSseStream()
      // Act
      const [, text] = await Promise.all([
        writeRaw(': heartbeat\n\n'),
        readOneChunk(readable),
      ])
      // Assert
      expect(text).toBe(': heartbeat\n\n')
    })

  })

})

// ═════════════════════════════════════════════════════════════════════════════
// close
// ═════════════════════════════════════════════════════════════════════════════

describe('close', () => {

  describe('Group 5 — sends done event and ends the stream', () => {

    it('should write the done event to the stream before closing', async () => {
      // Arrange: lock the reader before calling close so we can read the output
      const { readable, close } = createSseStream()
      const reader = readable.getReader()
      // Act
      close()
      // Assert: first read delivers the done event chunk
      const { value } = await reader.read()
      const text = value !== undefined ? decoder.decode(value) : ''
      expect(text).toBe('event: done\ndata: {}\n\n')
    })

    it('should end the stream — readable returns done:true after the done event is consumed', async () => {
      // Arrange
      const { readable, close } = createSseStream()
      const reader = readable.getReader()
      // Act
      close()
      await reader.read()                  // consume the done event chunk
      const { done } = await reader.read() // next read — stream-end signal
      // Assert
      expect(done).toBe(true)
    })

    it('should cause sendEvent to reject after the stream is closed', async () => {
      // Arrange: drain the readable fully — done:true guarantees the writer is closed
      const { readable, sendEvent, close } = createSseStream()
      const reader = readable.getReader()
      close()
      let streamDone = false
      while (!streamDone) {
        const result = await reader.read()
        streamDone = result.done
      }
      // Assert: writer is now closed — any subsequent write must reject
      await expect(sendEvent('title', { title: 'test' })).rejects.toThrow()
    })

  })

})

// ═════════════════════════════════════════════════════════════════════════════
// createHeartbeat
// ═════════════════════════════════════════════════════════════════════════════

describe('createHeartbeat', () => {

  describe('Group 6 — heartbeat interval and cleanup', () => {

    afterEach(() => {
      jest.useRealTimers()
    })

    it('should return a cleanup function', () => {
      // Arrange
      jest.useFakeTimers()
      const stream = createSseStream()
      // Act
      const cleanup = createHeartbeat(stream)
      // Assert
      expect(typeof cleanup).toBe('function')
      // Teardown: clear the interval so it does not outlive this test
      cleanup()
    })

    it('should call writeRaw with the heartbeat comment at exactly 10-second intervals', () => {
      // Arrange
      jest.useFakeTimers()
      const stream = createSseStream()
      const writeRawSpy = jest.spyOn(stream, 'writeRaw').mockResolvedValue(undefined)
      // Act
      createHeartbeat(stream)
      // Assert: not yet at 10s — no call
      jest.advanceTimersByTime(9_999)
      expect(writeRawSpy).not.toHaveBeenCalled()
      // At exactly 10s — first fire
      jest.advanceTimersByTime(1)
      expect(writeRawSpy).toHaveBeenCalledTimes(1)
      expect(writeRawSpy).toHaveBeenCalledWith(': heartbeat\n\n')
      // At 20s — second fire
      jest.advanceTimersByTime(10_000)
      expect(writeRawSpy).toHaveBeenCalledTimes(2)
    })

    it('should stop calling writeRaw after the cleanup function is called', () => {
      // Arrange
      jest.useFakeTimers()
      const stream = createSseStream()
      const writeRawSpy = jest.spyOn(stream, 'writeRaw').mockResolvedValue(undefined)
      const cleanup = createHeartbeat(stream)
      // Confirm the interval fires once before cleanup
      jest.advanceTimersByTime(10_000)
      expect(writeRawSpy).toHaveBeenCalledTimes(1)
      // Act
      cleanup()
      // Assert: no further calls — interval is cleared
      jest.advanceTimersByTime(10_000)
      expect(writeRawSpy).toHaveBeenCalledTimes(1) // still 1
    })

  })

})
