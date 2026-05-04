// Unit tests for agents/tagAgent.ts — 19 tests across 4 groups.
//
// @google/generative-ai is mocked via factory-level closures.
// global.fetch is intercepted for Qwen (primary), DeepSeek, and GLM-5 (all OpenRouter).
// Gemini is the only model using the SDK mock — it is fallback #2 in the chain.
// Timeout tests use jest.useFakeTimers() for Qwen — the primary OpenRouter model.
// sanitiseAiOutput is mocked as a transparent pass-through for most tests.

import { generateTags } from '../../../agents/tagAgent'

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('@google/generative-ai', () => {
  const generateContent    = jest.fn()
  const getGenerativeModel = jest.fn().mockReturnValue({ generateContent })
  const MockGoogleGenerativeAI = jest.fn().mockImplementation(() => ({ getGenerativeModel }))
  return {
    GoogleGenerativeAI:  MockGoogleGenerativeAI,
    _generateContent:    generateContent,
    _getGenerativeModel: getGenerativeModel,
  }
})

jest.mock('@/lib/security', () => ({
  sanitiseAiOutput: jest.fn(),
  extractDomain:    jest.fn(),
}))

const { _generateContent: mockGenerateContent } =
  jest.requireMock<{
    GoogleGenerativeAI:  jest.Mock
    _generateContent:    jest.MockedFunction<(prompt: string) => Promise<{ response: { text: () => string } }>>
    _getGenerativeModel: jest.Mock
  }>('@google/generative-ai')

const { sanitiseAiOutput: mockSanitise, extractDomain: mockExtractDomain } =
  jest.requireMock<{
    sanitiseAiOutput: jest.MockedFunction<(text: string, max: number) => string>
    extractDomain:    jest.MockedFunction<(url: string) => string>
  }>('@/lib/security')

// ─── Fetch spy — declared before helpers so closures can reference it ─────────

// safe: assigned unconditionally in beforeEach before any test runs
let mockFetch!: jest.SpyInstance

// ─── Helpers ─────────────────────────────────────────────────────────────────

type GeminiResult = { response: { text: () => string } }

/** OpenRouter response where content is JSON.stringify(tags). */
function mockOpenRouterSuccess(tags: string[]): Response {
  return new Response(
    JSON.stringify({ choices: [{ message: { content: JSON.stringify(tags) } }] }),
    { status: 200, headers: new Headers({ 'content-type': 'application/json' }) },
  )
}

/** OpenRouter response where content is the raw string as-is — used for parse edge cases. */
function mockOpenRouterSuccessRaw(raw: string): Response {
  return new Response(
    JSON.stringify({ choices: [{ message: { content: raw } }] }),
    { status: 200, headers: new Headers({ 'content-type': 'application/json' }) },
  )
}

/** Non-OK OpenRouter response with the given HTTP status. */
function mockOpenRouterFailure(status: number): Response {
  return new Response(null, { status })
}

function mockGeminiSuccess(tags: string[]): void {
  mockGenerateContent.mockResolvedValue({
    response: { text: (): string => JSON.stringify(tags) },
  })
}

function mockGeminiFailure(error: Error): void {
  mockGenerateContent.mockRejectedValue(error)
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────

beforeEach(() => {
  mockGenerateContent.mockReset()
  mockSanitise.mockReset()
  mockExtractDomain.mockReset()

  // Defaults: both Qwen (fetch) and Gemini (SDK) return 5 tags so any model can serve
  mockFetch = jest.spyOn(global, 'fetch')
  mockFetch.mockResolvedValue(mockOpenRouterSuccess(['tag1', 'tag2', 'tag3', 'tag4', 'tag5']))
  mockGeminiSuccess(['tag1', 'tag2', 'tag3', 'tag4', 'tag5'])
  mockSanitise.mockImplementation((text: string, maxLength: number): string =>
    text.slice(0, maxLength),
  )
  mockExtractDomain.mockReturnValue('example.com')

  process.env['GEMINI_API_KEY']     = 'test-gemini-key'
  process.env['OPENROUTER_API_KEY'] = 'test-openrouter-key'
})

afterEach(() => {
  jest.restoreAllMocks()
  delete process.env['GEMINI_API_KEY']
  delete process.env['OPENROUTER_API_KEY']
})

// ═════════════════════════════════════════════════════════════════════════════
// generateTags
// ═════════════════════════════════════════════════════════════════════════════

describe('generateTags', () => {

  // ─── Group 1 — Happy path ─────────────────────────────────────────────────

  describe('Group 1 — happy path', () => {

    it('should return exactly 3 tags and source primary when isPro is false', async () => {
      // Arrange: default mock returns 5 tags — parseTags slices to tagCount 3
      // Act
      const result = await generateTags('Page content', 'https://example.com/', false)
      // Assert: full AgentResult shape — exactly 3 string tags
      expect(result).toMatchObject({
        success:    true,
        source:     'primary',
        durationMs: expect.any(Number),
        data:       { tags: ['tag1', 'tag2', 'tag3'] },
      })
      expect(result.durationMs).toBeGreaterThanOrEqual(0)
      if (result.success) {
        expect(result.data.tags).toHaveLength(3)
        expect(typeof result.data.tags[0]).toBe('string')
      }
    })

    it('should return exactly 5 tags and source primary when isPro is true', async () => {
      // Arrange: default mock returns 5 tags — parseTags slices to tagCount 5
      // Act
      const result = await generateTags('Page content', 'https://example.com/', true)
      // Assert
      expect(result).toMatchObject({
        success:    true,
        source:     'primary',
        durationMs: expect.any(Number),
        data:       { tags: ['tag1', 'tag2', 'tag3', 'tag4', 'tag5'] },
      })
      if (result.success) {
        expect(result.data.tags).toHaveLength(5)
      }
    })

  })

  // ─── Group 2 — JSON parsing ───────────────────────────────────────────────

  describe('Group 2 — JSON parsing', () => {

    it('should parse a valid JSON array returned by the model', async () => {
      // Arrange: Qwen returns a clean JSON array
      mockFetch.mockResolvedValue(mockOpenRouterSuccess(['technology', 'ai', 'news']))
      // Act
      const result = await generateTags('Page content', 'https://example.com/', false)
      // Assert
      expect(result).toMatchObject({
        success: true, source: 'primary', durationMs: expect.any(Number),
        data:    { tags: ['technology', 'ai', 'news'] },
      })
    })

    it('should strip markdown code fences before parsing the JSON array', async () => {
      // Arrange: LLMs frequently wrap JSON in code fences — parseTags strips them
      const fenced = '```json\n["technology","ai","news"]\n```'
      mockFetch.mockResolvedValue(mockOpenRouterSuccessRaw(fenced))
      // Act
      const result = await generateTags('Page content', 'https://example.com/', false)
      // Assert: fences stripped, underlying JSON parsed correctly
      expect(result).toMatchObject({
        success: true, source: 'primary', durationMs: expect.any(Number),
        data:    { tags: ['technology', 'ai', 'news'] },
      })
    })

    it('should fall back to the next model when the response is not valid JSON', async () => {
      // Arrange: unparseable text — JSON.parse throws → parseTags returns null → Gemini tried
      mockFetch.mockResolvedValue(mockOpenRouterSuccessRaw('not valid json at all'))
      // mockGenerateContent default: returns valid 5-tag array
      // Act
      const result = await generateTags('Page content', 'https://example.com/', false)
      // Assert: Qwen parse failed → fell back to Gemini (source: fallback)
      expect(result).toMatchObject({
        success: true, source: 'fallback', durationMs: expect.any(Number),
      })
    })

    it('should fall back to the next model when the JSON array contains non-string elements', async () => {
      // Arrange: [1, 2, "valid"] — isStringArray returns false for mixed types →
      //          parseTags returns null for the entire array → Gemini tried
      mockFetch.mockResolvedValue(mockOpenRouterSuccessRaw(JSON.stringify([1, 2, 'valid'])))
      // Act
      const result = await generateTags('Page content', 'https://example.com/', false)
      // Assert: isStringArray check failed → fell back to Gemini
      expect(result).toMatchObject({
        success: true, source: 'fallback', durationMs: expect.any(Number),
      })
    })

    it('should filter out tags that exceed 50 characters', async () => {
      // Arrange: one tag is 51 chars (one over MAX_TAG_CHARS) — filtered; two valid tags remain
      const oversized = 'a'.repeat(51)
      mockFetch.mockResolvedValue(mockOpenRouterSuccess(['short', oversized, 'tag3']))
      // Act
      const result = await generateTags('Page content', 'https://example.com/', false)
      // Assert: oversized tag removed; 2 valid tags returned from Qwen (source: primary)
      expect(result).toMatchObject({ success: true, source: 'primary', durationMs: expect.any(Number) })
      if (result.success) {
        expect(result.data.tags).not.toContain(oversized)
        expect(result.data.tags).toHaveLength(2)
      }
    })

    it('should fall back to the next model when all tags exceed 50 characters', async () => {
      // Arrange: every tag over 50 chars — filter empties the array — parseTags returns null
      mockFetch.mockResolvedValue(
        mockOpenRouterSuccess(['a'.repeat(51), 'b'.repeat(60)]),
      )
      // Act
      const result = await generateTags('Page content', 'https://example.com/', false)
      // Assert: Qwen's array emptied after filter → fell back to Gemini
      expect(result).toMatchObject({
        success: true, source: 'fallback', durationMs: expect.any(Number),
      })
    })

    it('should call sanitiseAiOutput once for each tag with (tag, 50)', async () => {
      // Arrange: 3 valid tags — parseTags calls sanitiseAiOutput for each
      mockFetch.mockResolvedValue(mockOpenRouterSuccess(['tagA', 'tagB', 'tagC']))
      // Act
      await generateTags('Page content', 'https://example.com/', false)
      // Assert: sanitiseAiOutput called exactly 3 times — once per tag, always with max 50
      expect(mockSanitise).toHaveBeenCalledTimes(3)
      expect(mockSanitise).toHaveBeenCalledWith('tagA', 50)
      expect(mockSanitise).toHaveBeenCalledWith('tagB', 50)
      expect(mockSanitise).toHaveBeenCalledWith('tagC', 50)
    })

  })

  // ─── Group 3 — Fallback chain ─────────────────────────────────────────────

  describe('Group 3 — fallback chain', () => {

    describe('timeout behavior', () => {

      afterEach(() => {
        jest.useRealTimers()
      })

      it('should retry Qwen once after a timeout and succeed if the retry resolves', async () => {
        // Arrange: first Qwen fetch hangs; second resolves with valid tags
        jest.useFakeTimers()
        mockFetch
          .mockImplementationOnce(
            (): Promise<Response> => new Promise(() => { /* intentionally never resolves */ }),
          )
          .mockResolvedValueOnce(mockOpenRouterSuccess(['tag1', 'tag2', 'tag3']))
        // Act
        const resultPromise = generateTags('Page content', 'https://example.com/', false)
        await Promise.resolve()          // flush pending microtasks before advancing clock
        jest.advanceTimersByTime(10_001) // fire attempt-1 timeout
        const result = await resultPromise
        // Assert: source is 'primary' — same Qwen model retried within tryModel
        expect(result).toMatchObject({
          success:    true,
          source:     'primary',
          durationMs: expect.any(Number),
        })
        if (result.success) {
          expect(result.data.tags).toHaveLength(3)
        }
      })

      it('should fall back to Gemini when Qwen times out on both the initial call and the retry', async () => {
        // Arrange: all Qwen fetch calls hang; Gemini SDK default returns valid tags
        jest.useFakeTimers()
        mockFetch.mockImplementation(
          (): Promise<Response> => new Promise(() => { /* intentionally never resolves */ }),
        )
        // Act
        const resultPromise = generateTags('Page content', 'https://example.com/', false)
        await Promise.resolve()          // flush before first timer advance
        jest.advanceTimersByTime(10_001) // fire attempt-1 timeout
        await Promise.resolve()          // let catch block run and register attempt-2 setTimeout
        jest.advanceTimersByTime(10_001) // fire attempt-2 timeout → tryModel returns null
        const result = await resultPromise // Gemini SDK call resolves via microtask
        // Assert
        expect(result).toMatchObject({
          success:    true,
          source:     'fallback',
          durationMs: expect.any(Number),
        })
      })

    })

    it('should skip to Gemini immediately on a Qwen 429 error — no retry', async () => {
      // Arrange: 429 is non-TimeoutError → tryModel skips without retrying
      mockFetch.mockResolvedValue(mockOpenRouterFailure(429))
      // mockGenerateContent default: returns valid tags
      // Act
      const result = await generateTags('Page content', 'https://example.com/', false)
      // Assert: fetch called exactly once (no Qwen retry), Gemini succeeded
      expect(mockFetch).toHaveBeenCalledTimes(1)
      expect(result).toMatchObject({
        success:    true,
        source:     'fallback',
        durationMs: expect.any(Number),
      })
    })

    it('should fall back to DeepSeek when both Qwen and Gemini fail', async () => {
      // Arrange: Qwen → 429; Gemini → error; DeepSeek → success
      mockFetch
        .mockResolvedValueOnce(mockOpenRouterFailure(429))
        .mockResolvedValueOnce(mockOpenRouterSuccess(['t1', 't2', 't3', 't4', 't5']))
      mockGeminiFailure(new Error('Gemini error'))
      // Act
      const result = await generateTags('Page content', 'https://example.com/', false)
      // Assert: source is 'fallback' — DeepSeek is the third model
      expect(result).toMatchObject({
        success:    true,
        source:     'fallback',
        durationMs: expect.any(Number),
      })
    })

    it('should fall back to GLM-5 when Qwen, Gemini, and DeepSeek all fail', async () => {
      // Arrange: Qwen → 429; Gemini → error; DeepSeek → 500; GLM-5 → success
      mockFetch
        .mockResolvedValueOnce(mockOpenRouterFailure(429))
        .mockResolvedValueOnce(mockOpenRouterFailure(500))
        .mockResolvedValueOnce(mockOpenRouterSuccess(['t1', 't2', 't3', 't4', 't5']))
      mockGeminiFailure(new Error('Gemini error'))
      // Act
      const result = await generateTags('Page content', 'https://example.com/', false)
      // Assert: source is 'fallback' — GLM-5 is the fourth model
      expect(result).toMatchObject({
        success:    true,
        source:     'fallback',
        durationMs: expect.any(Number),
      })
    })

    it('should return a failure AgentResult when all four models fail', async () => {
      // Arrange: all OpenRouter calls return 500; Gemini SDK rejects
      mockFetch.mockResolvedValue(mockOpenRouterFailure(500))
      mockGeminiFailure(new Error('Gemini error'))
      // Act
      const result = await generateTags('Page content', 'https://example.com/', false)
      // Assert: source is 'primary' — buildFailure hardcodes 'primary'
      expect(result).toMatchObject({
        success:    false,
        source:     'primary',
        durationMs: expect.any(Number),
        error:      expect.any(String),
      })
    })

  })

  // ─── Group 4 — Input handling ─────────────────────────────────────────────

  describe('Group 4 — input handling', () => {

    it('should truncate input text to exactly 2 000 characters before sending to the model', async () => {
      // Arrange: 3 000-char text — only first 2 000 reach the model
      const longText = 'b'.repeat(3_000)
      // Act
      await generateTags(longText, 'https://example.com/', false)
      // Assert: fetch body user message contains exactly 2 000 'b' chars — not 2 001
      //         buildUserMessage wraps: "Page content:\n\n" + truncated
      expect(mockFetch).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          body: expect.stringContaining('b'.repeat(2_000)),
        }),
      )
      expect(mockFetch).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          body: expect.stringContaining('b'.repeat(2_001)),
        }),
      )
    })

    it('should embed "exactly 3" in the system prompt when isPro is false', async () => {
      // Arrange: default mocks; Qwen serves
      // Act
      await generateTags('Page content', 'https://example.com/', false)
      // Assert: Qwen fetch body system message contains the free-tier tag count
      expect(mockFetch).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          body: expect.stringContaining('exactly 3'),
        }),
      )
      expect(mockFetch).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          body: expect.stringContaining('exactly 5'),
        }),
      )
    })

    it('should embed "exactly 5" in the system prompt when isPro is true', async () => {
      // Arrange: default mocks; Qwen serves
      // Act
      await generateTags('Page content', 'https://example.com/', true)
      // Assert: Qwen fetch body system message contains the Pro-tier tag count
      expect(mockFetch).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          body: expect.stringContaining('exactly 5'),
        }),
      )
      expect(mockFetch).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          body: expect.stringContaining('exactly 3'),
        }),
      )
    })

    it('should call extractDomain with the url parameter', async () => {
      // Act
      await generateTags('Page content', 'https://example.com/article', false)
      // Assert
      expect(mockExtractDomain).toHaveBeenCalledWith('https://example.com/article')
    })

  })

})
