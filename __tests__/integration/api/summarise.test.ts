// Integration tests for app/api/summarise/route.ts — 26 tests across 7 groups.
//
// Tests the full request/response cycle of POST /api/summarise.
// All 5 module dependencies are mocked. The POST handler is called directly
// with a constructed Web API Request — no HTTP server or supertest needed.
//
// IMPORTANT — two test categories require different await patterns:
//   Synchronous response tests (400/429/402): assert immediately after POST.
//   Background IIFE tests (orchestrate, stopHeartbeat, decrementConcurrency):
//     await new Promise(resolve => setImmediate(resolve)) to drain microtasks
//     and let the fire-and-forget IIFE complete before asserting.

import * as RouteModule from '../../../app/api/summarise/route'
import { POST }         from '../../../app/api/summarise/route'
import type { OrchestratorResult } from '@/agents/orchestrator'
import type { SseStream }          from '@/lib/streaming'

// ─── Module mocks ─────────────────────────────────────────────────────────────

jest.mock('@/lib/security', () => ({
  validateUrl:   jest.fn(),
  extractDomain: jest.fn(),
}))

jest.mock('@/lib/rateLimit', () => ({
  checkRateLimit:       jest.fn(),
  incrementConcurrency: jest.fn(),
  decrementConcurrency: jest.fn(),
  getClientIp:          jest.fn(),
}))

jest.mock('@/lib/freeTier', () => ({
  checkFreeTier: jest.fn(),
}))

jest.mock('@/lib/streaming', () => ({
  createSseStream: jest.fn(),
  createHeartbeat: jest.fn(),
  SSE_HEADERS:     { 'Content-Type': 'text/event-stream' },
}))

jest.mock('@/agents/orchestrator', () => ({
  orchestrate: jest.fn(),
}))

// ─── Typed mock references ────────────────────────────────────────────────────

const { validateUrl: mockValidateUrl, extractDomain: mockExtractDomain } =
  jest.requireMock<{
    validateUrl:   jest.MockedFunction<(url: string) => Promise<{ valid: boolean; hostname: string }>>
    extractDomain: jest.MockedFunction<(url: string) => string>
  }>('@/lib/security')

const {
  checkRateLimit:       mockCheckRateLimit,
  incrementConcurrency: mockIncrementConcurrency,
  decrementConcurrency: mockDecrementConcurrency,
  getClientIp:          mockGetClientIp,
} = jest.requireMock<{
  checkRateLimit:       jest.MockedFunction<(ip: string) => { allowed: boolean; retryAfter: number }>
  incrementConcurrency: jest.MockedFunction<(ip: string) => { allowed: boolean }>
  decrementConcurrency: jest.MockedFunction<(ip: string) => void>
  getClientIp:          jest.MockedFunction<(req: Request) => string>
}>('@/lib/rateLimit')

const { checkFreeTier: mockCheckFreeTier } =
  jest.requireMock<{
    checkFreeTier: jest.MockedFunction<(ip: string) => { allowed: boolean; remaining: number }>
  }>('@/lib/freeTier')

const { createSseStream: mockCreateSseStream, createHeartbeat: mockCreateHeartbeat } =
  jest.requireMock<{
    createSseStream: jest.MockedFunction<() => SseStream>
    createHeartbeat: jest.MockedFunction<(stream: SseStream) => () => void>
  }>('@/lib/streaming')

const { orchestrate: mockOrchestrate } =
  jest.requireMock<{
    orchestrate: jest.MockedFunction<(url: string, isPro: boolean, stream: SseStream) => Promise<OrchestratorResult>>
  }>('@/agents/orchestrator')

// ─── Constants ────────────────────────────────────────────────────────────────

const TEST_URL = 'https://example.com/'

// ─── Mock stream ──────────────────────────────────────────────────────────────

function makeMockStream() {
  return {
    readable:  new ReadableStream<Uint8Array>(),
    sendEvent: jest.fn().mockResolvedValue(undefined),
    writeRaw:  jest.fn().mockResolvedValue(undefined),
    close:     jest.fn(),
  }
}

let mockStream:        ReturnType<typeof makeMockStream>
let mockStopHeartbeat: jest.Mock

// ─── Request helper ───────────────────────────────────────────────────────────

function makeRequest(body: unknown, ip = '1.2.3.4'): Request {
  return new Request('https://linksnapr.app/api/summarise', {
    method:  'POST',
    headers: {
      'Content-Type':    'application/json',
      'x-forwarded-for': ip,
    },
    body: JSON.stringify(body),
  })
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockValidateUrl.mockReset()
  mockExtractDomain.mockReset()
  mockCheckRateLimit.mockReset()
  mockIncrementConcurrency.mockReset()
  mockDecrementConcurrency.mockReset()
  mockGetClientIp.mockReset()
  mockCheckFreeTier.mockReset()
  mockOrchestrate.mockReset()
  mockCreateSseStream.mockReset()
  mockCreateHeartbeat.mockReset()

  mockStream        = makeMockStream()
  mockStopHeartbeat = jest.fn()

  // Happy-path defaults — override per test as needed
  mockValidateUrl.mockResolvedValue({ valid: true, hostname: 'example.com' })
  mockExtractDomain.mockReturnValue('example.com')
  mockGetClientIp.mockReturnValue('1.2.3.4')
  mockCheckRateLimit.mockReturnValue({ allowed: true, retryAfter: 0 })
  mockIncrementConcurrency.mockReturnValue({ allowed: true })
  mockCheckFreeTier.mockReturnValue({ allowed: true, remaining: 2 })
  mockOrchestrate.mockResolvedValue({
    title:            'Test Title',
    summary:          'Test summary.',
    tags:             ['tech', 'ai'],
    imageUrl:         'https://example.com/og.png',
    fromCache:        false,
    agentsDurationMs: 100,
  })
  mockCreateSseStream.mockReturnValue(mockStream as unknown as SseStream)
  mockCreateHeartbeat.mockReturnValue(mockStopHeartbeat)
})

afterEach(() => {
  jest.restoreAllMocks()
})

// ═════════════════════════════════════════════════════════════════════════════
// POST /api/summarise
// ═════════════════════════════════════════════════════════════════════════════

describe('POST /api/summarise', () => {

  // ─── Group 1 — Request validation ────────────────────────────────────────

  describe('Group 1 — request validation', () => {

    it('should not return 400 when the request has a valid URL', async () => {
      // Arrange: defaults from beforeEach
      // Act
      const response = await POST(makeRequest({ url: TEST_URL }))
      // Assert
      expect(response.status).not.toBe(400)
    })

    it('should return 400 with "Invalid request body" when the body cannot be parsed as JSON', async () => {
      // Arrange: raw empty string body — request.json() will throw a SyntaxError
      const request = new Request('https://linksnapr.app/api/summarise', {
        method: 'POST',
        body:   '',
      })
      // Act
      const response = await POST(request)
      // Assert
      expect(response.status).toBe(400)
      const body = await response.json() as { error: unknown }
      expect(body).toEqual({ error: 'Invalid request body' })
    })

    it('should return 400 when the body is valid JSON but has no url field', async () => {
      // Arrange
      // Act
      const response = await POST(makeRequest({ other: 'field' }))
      // Assert
      expect(response.status).toBe(400)
      const body = await response.json() as { error: unknown }
      expect(body).toEqual({ error: 'url is required and must be a string' })
    })

    it('should return 400 when the url field is present but is not a string', async () => {
      // Arrange
      // Act
      const response = await POST(makeRequest({ url: 123 }))
      // Assert
      expect(response.status).toBe(400)
      const body = await response.json() as { error: unknown }
      expect(body).toEqual({ error: 'url is required and must be a string' })
    })

    it('should return 400 with a generic message when validateUrl returns valid: false — no internal detail exposed', async () => {
      // Arrange: URL passes shape check but fails security validation
      mockValidateUrl.mockResolvedValue({ valid: false, hostname: '' })
      // Act
      const response = await POST(makeRequest({ url: 'http://192.168.1.1' }))
      // Assert: error is the generic string — raw URL or validation detail never returned
      expect(response.status).toBe(400)
      const body = await response.json() as { error: unknown }
      expect(body).toEqual({ error: 'This URL is not valid or cannot be accessed' })
    })

  })

  // ─── Group 2 — Rate limiting ──────────────────────────────────────────────

  describe('Group 2 — rate limiting', () => {

    it('should return 429 when checkRateLimit returns allowed: false', async () => {
      // Arrange
      mockCheckRateLimit.mockReturnValue({ allowed: false, retryAfter: 60 })
      // Act
      const response = await POST(makeRequest({ url: TEST_URL }))
      // Assert
      expect(response.status).toBe(429)
    })

    it('should include a Retry-After header on the rate-limit 429 response', async () => {
      // Arrange
      mockCheckRateLimit.mockReturnValue({ allowed: false, retryAfter: 60 })
      // Act
      const response = await POST(makeRequest({ url: TEST_URL }))
      // Assert
      expect(response.headers.get('Retry-After')).toBe('60')
    })

    it('should return only { error: "Too many requests" } in the rate-limit 429 body', async () => {
      // Arrange
      mockCheckRateLimit.mockReturnValue({ allowed: false, retryAfter: 60 })
      // Act
      const response = await POST(makeRequest({ url: TEST_URL }))
      // Assert: no stack trace, URL, or internal detail
      const body = await response.json() as { error: unknown }
      expect(body).toEqual({ error: 'Too many requests' })
    })

    it('should not call incrementConcurrency or orchestrate when the request is rate limited', async () => {
      // Arrange: rate limit (Section D) is checked before concurrency slot is acquired (Section E)
      mockCheckRateLimit.mockReturnValue({ allowed: false, retryAfter: 60 })
      // Act
      await POST(makeRequest({ url: TEST_URL }))
      // Assert
      expect(mockIncrementConcurrency).toHaveBeenCalledTimes(0)
      expect(mockOrchestrate).toHaveBeenCalledTimes(0)
    })

  })

  // ─── Group 3 — Concurrency limiting ──────────────────────────────────────

  describe('Group 3 — concurrency limiting', () => {

    it('should return 429 with "Too many concurrent requests" when incrementConcurrency returns allowed: false', async () => {
      // Arrange
      mockIncrementConcurrency.mockReturnValue({ allowed: false })
      // Act
      const response = await POST(makeRequest({ url: TEST_URL }))
      // Assert
      expect(response.status).toBe(429)
      const body = await response.json() as { error: unknown }
      expect(body).toEqual({ error: 'Too many concurrent requests' })
    })

    it('should not call decrementConcurrency when the concurrency slot was not granted', async () => {
      // Arrange: incrementConcurrency returns false — slot was never incremented, no decrement owed
      mockIncrementConcurrency.mockReturnValue({ allowed: false })
      // Act
      await POST(makeRequest({ url: TEST_URL }))
      // Assert: no spurious decrement
      expect(mockDecrementConcurrency).toHaveBeenCalledTimes(0)
    })

    it('should call decrementConcurrency with the client IP in the IIFE finally block after a successful request', async () => {
      // Arrange: defaults — orchestrate resolves normally
      // Act
      await POST(makeRequest({ url: TEST_URL }))
      // Flush microtasks so the IIFE finally block completes
      await new Promise<void>(resolve => { setImmediate(resolve) })
      // Assert
      expect(mockDecrementConcurrency).toHaveBeenCalledTimes(1)
      expect(mockDecrementConcurrency).toHaveBeenCalledWith('1.2.3.4')
    })

    it('should call decrementConcurrency in the finally block even when orchestrate throws', async () => {
      // Arrange: IIFE catch block handles the error — finally still runs
      mockOrchestrate.mockRejectedValue(new Error('unexpected crash'))
      // Act
      await POST(makeRequest({ url: TEST_URL }))
      await new Promise<void>(resolve => { setImmediate(resolve) })
      // Assert: slot always released regardless of outcome
      expect(mockDecrementConcurrency).toHaveBeenCalledTimes(1)
    })

  })

  // ─── Group 4 — Free tier ──────────────────────────────────────────────────

  describe('Group 4 — free tier', () => {

    it('should return 402 with free_tier_limit body when checkFreeTier returns allowed: false', async () => {
      // Arrange
      mockCheckFreeTier.mockReturnValue({ allowed: false, remaining: 0 })
      // Act
      const response = await POST(makeRequest({ url: TEST_URL }))
      // Assert
      expect(response.status).toBe(402)
      const body = await response.json() as { error: unknown; remaining: unknown; message: unknown }
      expect(body).toEqual({
        error:     'free_tier_limit',
        remaining: 0,
        message:   'Upgrade to Pro for unlimited summaries',
      })
    })

    it('should call decrementConcurrency synchronously before returning 402 — no setImmediate flush needed', async () => {
      // Arrange: concurrency was granted (Section E) then free tier blocked (Section F).
      //          decrementConcurrency is called directly in Section F, not in the IIFE finally.
      mockCheckFreeTier.mockReturnValue({ allowed: false, remaining: 0 })
      // Act: no setImmediate — this decrement is synchronous
      await POST(makeRequest({ url: TEST_URL }))
      // Assert
      expect(mockDecrementConcurrency).toHaveBeenCalledTimes(1)
      expect(mockDecrementConcurrency).toHaveBeenCalledWith('1.2.3.4')
    })

    it('should not call orchestrate or createSseStream when the free tier limit is reached', async () => {
      // Arrange
      mockCheckFreeTier.mockReturnValue({ allowed: false, remaining: 0 })
      // Act
      await POST(makeRequest({ url: TEST_URL }))
      // Assert: route returns 402 before Sections H and I — IIFE never starts
      expect(mockOrchestrate).toHaveBeenCalledTimes(0)
      expect(mockCreateSseStream).toHaveBeenCalledTimes(0)
    })

  })

  // ─── Group 5 — SSE response ───────────────────────────────────────────────

  describe('Group 5 — SSE response', () => {

    it('should return a Response that is not a 400, 429, or 402 for a valid request', async () => {
      // Arrange: defaults from beforeEach
      // Act
      const response = await POST(makeRequest({ url: TEST_URL }))
      // Assert
      expect(response).toBeInstanceOf(Response)
      expect(response.status).not.toBe(400)
      expect(response.status).not.toBe(429)
      expect(response.status).not.toBe(402)
    })

    it('should set Content-Type: text/event-stream on the SSE response', async () => {
      // Arrange: defaults from beforeEach
      // Act
      const response = await POST(makeRequest({ url: TEST_URL }))
      // Assert
      expect(response.headers.get('Content-Type')).toBe('text/event-stream')
    })

    it('should use sseStream.readable as the response body — same object reference', async () => {
      // Arrange: defaults from beforeEach
      // Act
      const response = await POST(makeRequest({ url: TEST_URL }))
      // Assert: route returns new Response(sseStream.readable, ...) — body is the stream
      expect(response.body).toBe(mockStream.readable)
    })

    it('should call orchestrate with the URL from the request body, isPro: false, and the SSE stream', async () => {
      // Arrange: defaults from beforeEach
      // Act
      await POST(makeRequest({ url: TEST_URL }))
      await new Promise<void>(resolve => { setImmediate(resolve) })
      // Assert: isPro is hardcoded false in the MVP (Section G)
      expect(mockOrchestrate).toHaveBeenCalledWith(TEST_URL, false, mockStream)
    })

  })

  // ─── Group 6 — Error handling ─────────────────────────────────────────────

  describe('Group 6 — error handling', () => {

    it('should call sendEvent with section: "server" and a generic message when orchestrate throws', async () => {
      // Arrange: IIFE catch block handles the rejection — no unhandled rejection
      mockOrchestrate.mockRejectedValue(new Error('unexpected crash'))
      // Act
      await POST(makeRequest({ url: TEST_URL }))
      await new Promise<void>(resolve => { setImmediate(resolve) })
      // Assert: catch block sends a generic error event — raw error never forwarded
      expect(mockStream.sendEvent).toHaveBeenCalledWith('error', {
        section: 'server',
        message: 'An unexpected error occurred',
      })
    })

    it('should call stream.close() in the catch block when orchestrate throws', async () => {
      // Arrange
      mockOrchestrate.mockRejectedValue(new Error('unexpected crash'))
      // Act
      await POST(makeRequest({ url: TEST_URL }))
      await new Promise<void>(resolve => { setImmediate(resolve) })
      // Assert
      expect(mockStream.close).toHaveBeenCalledTimes(1)
    })

    it('should call stopHeartbeat in the finally block when orchestrate throws', async () => {
      // Arrange
      mockOrchestrate.mockRejectedValue(new Error('unexpected crash'))
      // Act
      await POST(makeRequest({ url: TEST_URL }))
      await new Promise<void>(resolve => { setImmediate(resolve) })
      // Assert: heartbeat timer always stopped — no interval leak
      expect(mockStopHeartbeat).toHaveBeenCalledTimes(1)
    })

    it('should call decrementConcurrency in the finally block when orchestrate throws', async () => {
      // Arrange
      mockOrchestrate.mockRejectedValue(new Error('unexpected crash'))
      // Act
      await POST(makeRequest({ url: TEST_URL }))
      await new Promise<void>(resolve => { setImmediate(resolve) })
      // Assert: concurrency slot always released
      expect(mockDecrementConcurrency).toHaveBeenCalledTimes(1)
    })

  })

  // ─── Group 7 — Method guard ───────────────────────────────────────────────

  describe('Group 7 — method guard', () => {

    it('should export POST as a function', () => {
      // Arrange / Act: check the named export at module level
      // Assert
      expect(typeof POST).toBe('function')
    })

    it('should not export GET or PUT — Next.js returns 405 for unexported methods automatically', () => {
      // Arrange / Act: cast to a plain record to check runtime exports without TypeScript errors
      const module = RouteModule as Record<string, unknown>
      // Assert
      expect(module['GET']).toBeUndefined()
      expect(module['PUT']).toBeUndefined()
    })

  })

})
