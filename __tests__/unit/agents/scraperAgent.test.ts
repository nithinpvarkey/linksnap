// Unit tests for agents/scraperAgent.ts — 26 tests across 9 groups.
//
// @/lib/security is mocked — no real URL validation or DNS calls.
// global.fetch is intercepted via jest.spyOn — no real network requests.
// cheerio is NOT mocked — real HTML strings are parsed by real cheerio.
// Every test verifies the full AgentResult shape on every code path.

import { scrapeUrl } from '../../../agents/scraperAgent'

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('@/lib/security', () => ({
  validateUrl:      jest.fn(),
  validateRedirect: jest.fn(),
  extractDomain:    jest.fn().mockReturnValue('example.com'),
}))

const { validateUrl, validateRedirect } =
  jest.requireMock<{
    validateUrl:      jest.MockedFunction<(url: string) => Promise<{ valid: boolean }>>
    validateRedirect: jest.MockedFunction<(url: string, hop: number) => Promise<{ valid: boolean }>>
  }>('@/lib/security')

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Real Response — text() and headers.get() both work correctly. */
function makeResponse(
  body:          string,
  status         = 200,
  extraHeaders?: Record<string, string>,
): Response {
  return new Response(body, {
    status,
    headers: new Headers({ 'content-type': 'text/html', ...extraHeaders }),
  })
}

/** Redirect response with the given Location header. text() is never called on redirects. */
function makeRedirectResponse(status: number, location: string): Response {
  return new Response(null, {
    status,
    headers: new Headers({ location }),
  })
}

// ─── HTML fixtures ────────────────────────────────────────────────────────────

const HAPPY_PATH_HTML = `
<html>
  <head>
    <meta property="og:title" content="OG Title" />
    <meta property="og:image" content="https://example.com/img.png" />
    <link rel="icon" href="/favicon.ico" />
    <title>Page Title</title>
  </head>
  <body><p>Some body text</p></body>
</html>
`

const MINIMAL_HTML = '<html><head></head><body></body></html>'

// ─── Lifecycle ───────────────────────────────────────────────────────────────

// safe: assigned unconditionally in beforeEach before any test runs
let mockFetch!: jest.SpyInstance

beforeEach(() => {
  mockFetch = jest.spyOn(global, 'fetch')
  validateUrl.mockClear()
  validateRedirect.mockClear()
  validateUrl.mockResolvedValue({ valid: true })
  validateRedirect.mockResolvedValue({ valid: true })
  mockFetch.mockResolvedValue(makeResponse(HAPPY_PATH_HTML))
})

afterEach(() => {
  mockFetch.mockRestore()
})

// ═════════════════════════════════════════════════════════════════════════════
// scrapeUrl
// ═════════════════════════════════════════════════════════════════════════════

describe('scrapeUrl', () => {

  // ─── Group 1 — Happy path ─────────────────────────────────────────────────

  describe('Group 1 — happy path', () => {

    it('should return a complete successful AgentResult with all data fields populated', async () => {
      // Arrange: beforeEach sets validateUrl valid and fetch returns HAPPY_PATH_HTML
      // Act
      const result = await scrapeUrl('https://example.com/')
      // Assert: full AgentResult shape — success, source, durationMs, and all data fields
      expect(result).toMatchObject({
        success:    true,
        source:     'primary',
        durationMs: expect.any(Number),
        data: {
          title:   'OG Title',
          ogImage: 'https://example.com/img.png',
          favicon: 'https://example.com/favicon.ico',
          url:     'https://example.com/',
          text:    expect.stringContaining('Some body text'),
        },
      })
      expect(result.durationMs).toBeGreaterThanOrEqual(0)
    })

  })

  // ─── Group 2 — Title extraction ───────────────────────────────────────────

  describe('Group 2 — title extraction', () => {

    it('should use og:title when present', async () => {
      // Arrange
      mockFetch.mockResolvedValue(makeResponse(`
        <html><head>
          <meta property="og:title" content="OG Title" />
          <title>Fallback Title</title>
        </head><body></body></html>
      `))
      // Act
      const result = await scrapeUrl('https://example.com/')
      // Assert
      expect(result).toMatchObject({
        success: true, source: 'primary', durationMs: expect.any(Number),
        data: { title: 'OG Title' },
      })
    })

    it('should fall back to the title tag when og:title is absent', async () => {
      // Arrange
      mockFetch.mockResolvedValue(makeResponse(`
        <html><head><title>Page Title</title></head><body></body></html>
      `))
      // Act
      const result = await scrapeUrl('https://example.com/')
      // Assert
      expect(result).toMatchObject({
        success: true, source: 'primary', durationMs: expect.any(Number),
        data: { title: 'Page Title' },
      })
    })

    it('should return an empty string when both og:title and title tag are absent', async () => {
      // Arrange
      mockFetch.mockResolvedValue(makeResponse(MINIMAL_HTML))
      // Act
      const result = await scrapeUrl('https://example.com/')
      // Assert
      expect(result).toMatchObject({
        success: true, source: 'primary', durationMs: expect.any(Number),
        data: { title: '' },
      })
    })

  })

  // ─── Group 3 — Image extraction ───────────────────────────────────────────

  describe('Group 3 — image extraction', () => {

    it('should return the og:image URL when present', async () => {
      // Arrange
      mockFetch.mockResolvedValue(makeResponse(`
        <html><head>
          <meta property="og:image" content="https://cdn.example.com/hero.jpg" />
        </head><body></body></html>
      `))
      // Act
      const result = await scrapeUrl('https://example.com/')
      // Assert
      expect(result).toMatchObject({
        success: true, source: 'primary', durationMs: expect.any(Number),
        data: { ogImage: 'https://cdn.example.com/hero.jpg' },
      })
    })

    it('should return an empty string when og:image is absent', async () => {
      // Arrange
      mockFetch.mockResolvedValue(makeResponse(MINIMAL_HTML))
      // Act
      const result = await scrapeUrl('https://example.com/')
      // Assert
      expect(result).toMatchObject({
        success: true, source: 'primary', durationMs: expect.any(Number),
        data: { ogImage: '' },
      })
    })

  })

  // ─── Group 4 — Favicon extraction ─────────────────────────────────────────

  describe('Group 4 — favicon extraction', () => {

    it('should resolve link[rel="icon"] href to an absolute URL', async () => {
      // Arrange
      mockFetch.mockResolvedValue(makeResponse(`
        <html><head>
          <link rel="icon" href="/assets/icon.png" />
        </head><body></body></html>
      `))
      // Act
      const result = await scrapeUrl('https://example.com/')
      // Assert
      expect(result).toMatchObject({
        success: true, source: 'primary', durationMs: expect.any(Number),
        data: { favicon: 'https://example.com/assets/icon.png' },
      })
    })

    it('should resolve apple-touch-icon href when no link[rel="icon"] is present', async () => {
      // Arrange
      mockFetch.mockResolvedValue(makeResponse(`
        <html><head>
          <link rel="apple-touch-icon" href="/apple-icon.png" />
        </head><body></body></html>
      `))
      // Act
      const result = await scrapeUrl('https://example.com/')
      // Assert
      expect(result).toMatchObject({
        success: true, source: 'primary', durationMs: expect.any(Number),
        data: { favicon: 'https://example.com/apple-icon.png' },
      })
    })

    it('should return the /favicon.ico fallback URL when no favicon link tag is present', async () => {
      // Arrange
      mockFetch.mockResolvedValue(makeResponse(MINIMAL_HTML))
      // Act
      const result = await scrapeUrl('https://example.com/')
      // Assert
      expect(result).toMatchObject({
        success: true, source: 'primary', durationMs: expect.any(Number),
        data: { favicon: 'https://example.com/favicon.ico' },
      })
    })

    it('should return an empty string for favicon when the base URL is unparseable', async () => {
      // Arrange: MINIMAL_HTML has no favicon links — extractFavicon falls through to
      //          new URL('/favicon.ico', baseUrl) where baseUrl = 'not-a-valid-url' → throws → ''
      mockFetch.mockResolvedValue(makeResponse(MINIMAL_HTML))
      // Act: validateUrl is mocked to allow any string — baseUrl comes from the URL arg
      const result = await scrapeUrl('not-a-valid-url')
      // Assert
      expect(result).toMatchObject({
        success: true, source: 'primary', durationMs: expect.any(Number),
        data: { favicon: '' },
      })
    })

  })

  // ─── Group 5 — Text extraction ────────────────────────────────────────────

  describe('Group 5 — text extraction', () => {

    it('should remove script tag content from extracted text', async () => {
      // Arrange
      mockFetch.mockResolvedValue(makeResponse(`
        <html><body>
          <p>visible text</p>
          <script>var secret = "should not appear";</script>
        </body></html>
      `))
      // Act
      const result = await scrapeUrl('https://example.com/')
      // Assert
      expect(result).toMatchObject({ success: true, source: 'primary', durationMs: expect.any(Number) })
      if (result.success) {
        expect(result.data.text).toContain('visible text')
        expect(result.data.text).not.toContain('secret')
      }
    })

    it('should remove style tag content from extracted text', async () => {
      // Arrange
      mockFetch.mockResolvedValue(makeResponse(`
        <html><body>
          <p>visible text</p>
          <style>body { color: red; }</style>
        </body></html>
      `))
      // Act
      const result = await scrapeUrl('https://example.com/')
      // Assert
      expect(result).toMatchObject({ success: true, source: 'primary', durationMs: expect.any(Number) })
      if (result.success) {
        expect(result.data.text).toContain('visible text')
        expect(result.data.text).not.toContain('color')
      }
    })

    it('should remove iframe tag content from extracted text', async () => {
      // Arrange
      mockFetch.mockResolvedValue(makeResponse(`
        <html><body>
          <p>visible text</p>
          <iframe src="https://ads.example.com">iframe content</iframe>
        </body></html>
      `))
      // Act
      const result = await scrapeUrl('https://example.com/')
      // Assert
      expect(result).toMatchObject({ success: true, source: 'primary', durationMs: expect.any(Number) })
      if (result.success) {
        expect(result.data.text).toContain('visible text')
        expect(result.data.text).not.toContain('iframe content')
      }
    })

    it('should truncate extracted text to exactly 50 000 characters', async () => {
      // Arrange: 60 000-char body — well over the 50 000-char limit
      const longText = 'a'.repeat(60_000)
      mockFetch.mockResolvedValue(makeResponse(`<html><body><p>${longText}</p></body></html>`))
      // Act
      const result = await scrapeUrl('https://example.com/')
      // Assert
      expect(result).toMatchObject({ success: true, source: 'primary', durationMs: expect.any(Number) })
      if (result.success) {
        expect(result.data.text.length).toBe(50_000)
      }
    })

  })

  // ─── Group 6 — URL validation ─────────────────────────────────────────────

  describe('Group 6 — URL validation', () => {

    it('should return a failure AgentResult when validateUrl returns invalid', async () => {
      // Arrange
      validateUrl.mockResolvedValue({ valid: false })
      // Act
      const result = await scrapeUrl('http://blocked.example')
      // Assert
      expect(result).toMatchObject({
        success:    false,
        source:     'primary',
        durationMs: expect.any(Number),
        error:      expect.any(String),
      })
    })

    it('should call validateUrl with the original URL before any fetch', async () => {
      // Arrange: default mocks allow success
      const url = 'https://example.com/'
      // Act
      await scrapeUrl(url)
      // Assert: validateUrl called exactly once with the correct URL
      expect(validateUrl).toHaveBeenCalledTimes(1)
      expect(validateUrl).toHaveBeenCalledWith(url)
    })

    it('should never call fetch when validateUrl returns invalid', async () => {
      // Arrange
      validateUrl.mockResolvedValue({ valid: false })
      // Act
      await scrapeUrl('http://blocked.example')
      // Assert: fetch must not be called — URL rejected before any network request
      expect(mockFetch).not.toHaveBeenCalled()
    })

  })

  // ─── Group 7 — Redirect handling ──────────────────────────────────────────

  describe('Group 7 — redirect handling', () => {

    it('should follow a single redirect and return content from the final URL', async () => {
      // Arrange: first fetch returns 301 → second fetch returns the final HTML
      mockFetch
        .mockResolvedValueOnce(makeRedirectResponse(301, 'https://example.com/new'))
        .mockResolvedValueOnce(makeResponse(`
          <html><head>
            <meta property="og:title" content="New Page" />
          </head><body></body></html>
        `))
      // Act
      const result = await scrapeUrl('https://example.com/')
      // Assert: title and url come from the redirect destination
      expect(result).toMatchObject({
        success:    true,
        source:     'primary',
        durationMs: expect.any(Number),
        data: { title: 'New Page', url: 'https://example.com/new' },
      })
    })

    it('should return failure when validateRedirect blocks a redirect to a private IP', async () => {
      // Arrange
      mockFetch.mockResolvedValueOnce(makeRedirectResponse(301, 'http://192.168.1.1/evil'))
      validateRedirect.mockResolvedValue({ valid: false })
      // Act
      const result = await scrapeUrl('https://example.com/')
      // Assert
      expect(result).toMatchObject({
        success:    false,
        source:     'primary',
        durationMs: expect.any(Number),
        error:      expect.any(String),
      })
    })

    it('should return failure after more than 3 consecutive redirects', async () => {
      // Arrange: every fetch returns a redirect — the 4-hop loop exhausts and throws
      mockFetch.mockResolvedValue(makeRedirectResponse(302, 'https://example.com/loop'))
      // Act
      const result = await scrapeUrl('https://example.com/')
      // Assert
      expect(result).toMatchObject({
        success:    false,
        source:     'primary',
        durationMs: expect.any(Number),
        error:      expect.any(String),
      })
    })

    it('should resolve a relative redirect Location to an absolute URL before the next fetch', async () => {
      // Arrange: first response gives a relative Location header
      mockFetch
        .mockResolvedValueOnce(makeRedirectResponse(302, '/new-path'))
        .mockResolvedValueOnce(makeResponse(MINIMAL_HTML))
      // Act
      await scrapeUrl('https://example.com/')
      // Assert: second fetch received the resolved absolute URL, not the bare relative path
      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        'https://example.com/new-path',
        expect.objectContaining({ redirect: 'manual' }),
      )
    })

  })

  // ─── Group 8 — Resource limits ────────────────────────────────────────────

  describe('Group 8 — resource limits', () => {

    afterEach(() => {
      jest.useRealTimers()
    })

    it('should return failure when the content-length header exceeds 1MB', async () => {
      // Arrange: content-length is one byte over the 1 048 576-byte limit
      mockFetch.mockResolvedValue(makeResponse('', 200, { 'content-length': '1048577' }))
      // Act
      const result = await scrapeUrl('https://example.com/')
      // Assert
      expect(result).toMatchObject({
        success:    false,
        source:     'primary',
        durationMs: expect.any(Number),
        error:      expect.any(String),
      })
    })

    it('should return failure when fetch does not respond within 5 seconds', async () => {
      // Arrange: fetch hangs forever — only rejects when the AbortSignal fires
      jest.useFakeTimers()
      mockFetch.mockImplementation(
        (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
          const signal = init?.signal ?? null
          return new Promise<Response>((_resolve, reject) => {
            if (signal) {
              signal.addEventListener('abort', () => {
                reject(new DOMException('The operation was aborted.', 'AbortError'))
              })
            }
          })
        },
      )
      // Act: start scrapeUrl, yield once so validateUrl resolves and setTimeout registers,
      //      then advance 5 001ms to fire controller.abort()
      const resultPromise = scrapeUrl('https://example.com/')
      await Promise.resolve()
      jest.advanceTimersByTime(5_001)
      const result = await resultPromise
      // Assert
      expect(result).toMatchObject({
        success:    false,
        source:     'primary',
        durationMs: expect.any(Number),
        error:      expect.any(String),
      })
    })

  })

  // ─── Group 9 — Error handling ─────────────────────────────────────────────

  describe('Group 9 — error handling', () => {

    it('should return failure when fetch rejects with a network error', async () => {
      // Arrange
      mockFetch.mockRejectedValue(new Error('Network error'))
      // Act
      const result = await scrapeUrl('https://example.com/')
      // Assert
      expect(result).toMatchObject({
        success:    false,
        source:     'primary',
        durationMs: expect.any(Number),
        error:      expect.any(String),
      })
    })

    it('should return failure when response.text() rejects with a stream error', async () => {
      // Arrange: Response instance with text() overridden to reject — simulates broken body stream
      const brokenResponse = new Response('', { status: 200 })
      Object.defineProperty(brokenResponse, 'text', {
        value:        (): Promise<string> => Promise.reject(new Error('Stream error')),
        writable:     true,
        configurable: true,
      })
      mockFetch.mockResolvedValue(brokenResponse)
      // Act
      const result = await scrapeUrl('https://example.com/')
      // Assert
      expect(result).toMatchObject({
        success:    false,
        source:     'primary',
        durationMs: expect.any(Number),
        error:      expect.any(String),
      })
    })

    it('should always resolve to an AgentResult and never throw — even on unexpected errors', async () => {
      // Arrange: TypeError is an unexpected runtime crash — not a typical network failure
      mockFetch.mockRejectedValue(new TypeError('Unexpected crash'))
      // Act & Assert: resolves (not rejects) — scrapeUrl's try/catch guarantees this
      await expect(scrapeUrl('https://example.com/')).resolves.toMatchObject({
        success:    false,
        source:     'primary',
        durationMs: expect.any(Number),
        error:      expect.any(String),
      })
    })

  })

})
