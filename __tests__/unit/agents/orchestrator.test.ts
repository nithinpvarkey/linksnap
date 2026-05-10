// Unit tests for agents/orchestrator.ts — 21 tests across 6 groups.
//
// All 5 module dependencies are mocked via jest.mock factories.
// SseStream is passed as a parameter — orchestrate never calls createSseStream
// internally — so tests pass a fake object directly via makeMockStream().
// findImage is async — its mock uses mockResolvedValue.
// beforeEach creates a fresh mockStream and sets all mocks to happy-path defaults.

import { orchestrate } from '../../../agents/orchestrator'
import type { AgentResult, ScraperResult, SummaryResult, TagResult, ImageResult } from '@/lib/types'
import type { CachedCard } from '@/lib/cache'
import type { SseStream } from '@/lib/streaming'

// ─── Module mocks ─────────────────────────────────────────────────────────────

jest.mock('@/lib/cache', () => ({
  getCached: jest.fn(),
  setCached: jest.fn(),
}))

jest.mock('@/lib/streaming', () => ({
  createSseStream: jest.fn(),
}))

jest.mock('@/agents/scraperAgent', () => ({
  scrapeUrl: jest.fn(),
}))

jest.mock('@/agents/summaryAgent', () => ({
  summarisePage: jest.fn(),
}))

jest.mock('@/agents/tagAgent', () => ({
  generateTags: jest.fn(),
}))

jest.mock('@/agents/imageAgent', () => ({
  findImage: jest.fn(),
}))

// ─── Typed mock references ────────────────────────────────────────────────────

const { getCached: mockGetCached, setCached: mockSetCached } =
  jest.requireMock<{
    getCached: jest.MockedFunction<(url: string) => Promise<CachedCard | null>>
    setCached: jest.MockedFunction<(url: string, card: CachedCard) => Promise<void>>
  }>('@/lib/cache')

const { scrapeUrl: mockScrapeUrl } =
  jest.requireMock<{
    scrapeUrl: jest.MockedFunction<(url: string) => Promise<AgentResult<ScraperResult>>>
  }>('@/agents/scraperAgent')

const { summarisePage: mockSummarisePage } =
  jest.requireMock<{
    summarisePage: jest.MockedFunction<(text: string, url: string) => Promise<AgentResult<SummaryResult>>>
  }>('@/agents/summaryAgent')

const { generateTags: mockGenerateTags } =
  jest.requireMock<{
    generateTags: jest.MockedFunction<(text: string, url: string, isPro: boolean, title: string) => Promise<AgentResult<TagResult>>>
  }>('@/agents/tagAgent')

const { findImage: mockFindImage } =
  jest.requireMock<{
    findImage: jest.MockedFunction<(scraperResult: ScraperResult, url: string, summary: string, title: string) => Promise<AgentResult<ImageResult>>>
  }>('@/agents/imageAgent')

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

let mockStream: ReturnType<typeof makeMockStream>

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeCachedCard(overrides: Partial<CachedCard> = {}): CachedCard {
  return {
    title:    'Cached Title',
    summary:  'Cached summary.',
    tags:     ['cache-tag-1', 'cache-tag-2'],
    imageUrl: 'https://example.com/cached.png',
    cachedAt: 1_000,
    ...overrides,
  }
}

function makeScraperSuccess(): AgentResult<ScraperResult> {
  return {
    success:    true,
    source:     'primary',
    durationMs: 5,
    data: {
      title:   'Scraped Title',
      text:    'Scraped body text.',
      ogImage: 'https://example.com/og.png',
      favicon: 'https://example.com/favicon.ico',
      url:     TEST_URL,
    },
  }
}

function makeScraperFailure(error = 'Scraper failed'): AgentResult<ScraperResult> {
  return { success: false, source: 'primary', durationMs: 5, error }
}

function makeSummarySuccess(summary = 'Test summary.'): AgentResult<SummaryResult> {
  return { success: true, source: 'primary', durationMs: 10, data: { summary } }
}

function makeSummaryFailure(): AgentResult<SummaryResult> {
  return { success: false, source: 'primary', durationMs: 10, error: 'Summary failed' }
}

function makeTagsSuccess(tags = ['tech', 'ai', 'web']): AgentResult<TagResult> {
  return { success: true, source: 'primary', durationMs: 10, data: { tags } }
}

function makeTagsFailure(): AgentResult<TagResult> {
  return { success: false, source: 'primary', durationMs: 10, error: 'Tags failed' }
}

function makeImageSuccess(imageUrl = 'https://example.com/og.png'): AgentResult<ImageResult> {
  return { success: true, source: 'primary', durationMs: 0, data: { imageUrl } }
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockGetCached.mockReset()
  mockSetCached.mockReset()
  mockScrapeUrl.mockReset()
  mockSummarisePage.mockReset()
  mockGenerateTags.mockReset()
  mockFindImage.mockReset()

  mockStream = makeMockStream()

  // Happy-path defaults — override per test as needed
  mockGetCached.mockResolvedValue(null)
  mockSetCached.mockResolvedValue(undefined)
  mockScrapeUrl.mockResolvedValue(makeScraperSuccess())
  mockSummarisePage.mockResolvedValue(makeSummarySuccess())
  mockGenerateTags.mockResolvedValue(makeTagsSuccess())
  mockFindImage.mockResolvedValue(makeImageSuccess())
})

afterEach(() => {
  jest.restoreAllMocks()
})

// ═════════════════════════════════════════════════════════════════════════════
// orchestrate
// ═════════════════════════════════════════════════════════════════════════════

describe('orchestrate', () => {

  // ─── Group 1 — Cache hit ──────────────────────────────────────────────────

  describe('Group 1 — cache hit', () => {

    it('should return OrchestratorResult with fromCache: true and data matching the cached card', async () => {
      const card = makeCachedCard()
      mockGetCached.mockResolvedValue(card)
      const result = await orchestrate(TEST_URL, false, mockStream as unknown as SseStream, 'test-card-id')
      expect(result).toMatchObject({
        title:            card.title,
        summary:          card.summary,
        tags:             card.tags,
        imageUrl:         card.imageUrl,
        fromCache:        true,
        agentsDurationMs: expect.any(Number),
      })
    })

    it('should send image, title, tag, and summary SSE events for a cached card', async () => {
      const card = makeCachedCard({ tags: ['tag-a'] })
      mockGetCached.mockResolvedValue(card)
      await orchestrate(TEST_URL, false, mockStream as unknown as SseStream, 'test-card-id')
      expect(mockStream.sendEvent).toHaveBeenCalledWith('image',   { imageUrl: card.imageUrl })
      expect(mockStream.sendEvent).toHaveBeenCalledWith('title',   { title:    card.title    })
      expect(mockStream.sendEvent).toHaveBeenCalledWith('tag',     { tag:      'tag-a'       })
      expect(mockStream.sendEvent).toHaveBeenCalledWith('summary', { token:    card.summary  })
    })

    it('should send exactly one tag event per tag in cached.tags — two tags produce two tag events', async () => {
      const card = makeCachedCard({ tags: ['alpha', 'beta'] })
      mockGetCached.mockResolvedValue(card)
      await orchestrate(TEST_URL, false, mockStream as unknown as SseStream, 'test-card-id')
      expect(mockStream.sendEvent).toHaveBeenCalledTimes(5)
      expect(mockStream.sendEvent).toHaveBeenCalledWith('tag', { tag: 'alpha' })
      expect(mockStream.sendEvent).toHaveBeenCalledWith('tag', { tag: 'beta'  })
    })

    it('should call stream.close() exactly once on a cache hit', async () => {
      mockGetCached.mockResolvedValue(makeCachedCard())
      await orchestrate(TEST_URL, false, mockStream as unknown as SseStream, 'test-card-id')
      expect(mockStream.close).toHaveBeenCalledTimes(1)
    })

    it('should not call any agent when getCached returns a hit', async () => {
      mockGetCached.mockResolvedValue(makeCachedCard())
      await orchestrate(TEST_URL, false, mockStream as unknown as SseStream, 'test-card-id')
      expect(mockScrapeUrl).toHaveBeenCalledTimes(0)
      expect(mockSummarisePage).toHaveBeenCalledTimes(0)
      expect(mockGenerateTags).toHaveBeenCalledTimes(0)
      expect(mockFindImage).toHaveBeenCalledTimes(0)
    })

  })

  // ─── Group 2 — Cache miss happy path ─────────────────────────────────────

  describe('Group 2 — cache miss happy path', () => {

    it('should call all agents with arguments derived from the input URL and scraper data', async () => {
      await orchestrate(TEST_URL, true, mockStream as unknown as SseStream, 'test-card-id')
      expect(mockScrapeUrl).toHaveBeenCalledWith(TEST_URL)
      expect(mockSummarisePage).toHaveBeenCalledWith('Scraped body text.', 'Scraped Title', TEST_URL)
      expect(mockGenerateTags).toHaveBeenCalledWith('Scraped body text.', TEST_URL, true, 'Scraped Title')
      expect(mockFindImage).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Scraped Title', text: 'Scraped body text.' }),
        TEST_URL,
        '',               // findImage uses scraperResult.ogImage — summary not needed
        'Scraped Title',
      )
    })

    it('should send title, image, summary, and tag events with data from agent results', async () => {
      await orchestrate(TEST_URL, false, mockStream as unknown as SseStream, 'test-card-id')
      expect(mockStream.sendEvent).toHaveBeenCalledWith('title',   { title:    'Scraped Title'               })
      expect(mockStream.sendEvent).toHaveBeenCalledWith('image',   { imageUrl: 'https://example.com/og.png' })
      expect(mockStream.sendEvent).toHaveBeenCalledWith('summary', { token:    'Test summary.'              })
      expect(mockStream.sendEvent).toHaveBeenCalledWith('tag',     { tag:      'tech'                       })
      expect(mockStream.sendEvent).toHaveBeenCalledWith('tag',     { tag:      'ai'                         })
      expect(mockStream.sendEvent).toHaveBeenCalledWith('tag',     { tag:      'web'                        })
    })

    it('should call stream.close() exactly once after all agents settle', async () => {
      await orchestrate(TEST_URL, false, mockStream as unknown as SseStream, 'test-card-id')
      expect(mockStream.close).toHaveBeenCalledTimes(1)
    })

    it('should call setCached with the input URL and the assembled card', async () => {
      await orchestrate(TEST_URL, false, mockStream as unknown as SseStream, 'test-card-id')
      expect(mockSetCached).toHaveBeenCalledWith(
        TEST_URL,
        expect.objectContaining({
          title:    'Scraped Title',
          summary:  'Test summary.',
          tags:     ['tech', 'ai', 'web'],
          imageUrl: 'https://example.com/og.png',
        }),
      )
    })

    it('should return OrchestratorResult with fromCache: false, assembled fields, and agentsDurationMs >= 0', async () => {
      const result = await orchestrate(TEST_URL, false, mockStream as unknown as SseStream, 'test-card-id')
      expect(result).toMatchObject({
        title:            'Scraped Title',
        summary:          'Test summary.',
        tags:             ['tech', 'ai', 'web'],
        imageUrl:         'https://example.com/og.png',
        fromCache:        false,
        agentsDurationMs: expect.any(Number),
      })
      expect(result.agentsDurationMs).toBeGreaterThanOrEqual(0)
    })

  })

  // ─── Group 3 — Scraper failure ────────────────────────────────────────────

  describe('Group 3 — scraper failure', () => {

    it('should send an error event with section: "scraper" and the scraper error message', async () => {
      mockScrapeUrl.mockResolvedValue(makeScraperFailure('Page could not be fetched'))
      await orchestrate(TEST_URL, false, mockStream as unknown as SseStream, 'test-card-id')
      expect(mockStream.sendEvent).toHaveBeenCalledWith('error', {
        section: 'scraper',
        message: 'Page could not be fetched',
      })
    })

    it('should call stream.close() and never call summarisePage, generateTags, findImage, or setCached', async () => {
      mockScrapeUrl.mockResolvedValue(makeScraperFailure())
      await orchestrate(TEST_URL, false, mockStream as unknown as SseStream, 'test-card-id')
      expect(mockStream.close).toHaveBeenCalledTimes(1)
      expect(mockSummarisePage).toHaveBeenCalledTimes(0)
      expect(mockGenerateTags).toHaveBeenCalledTimes(0)
      expect(mockFindImage).toHaveBeenCalledTimes(0)
      expect(mockSetCached).toHaveBeenCalledTimes(0)
    })

    it('should return OrchestratorResult with all empty fields and fromCache: false', async () => {
      mockScrapeUrl.mockResolvedValue(makeScraperFailure())
      const result = await orchestrate(TEST_URL, false, mockStream as unknown as SseStream, 'test-card-id')
      expect(result).toMatchObject({
        title:            '',
        summary:          '',
        tags:             [],
        imageUrl:         '',
        fromCache:        false,
        agentsDurationMs: expect.any(Number),
      })
    })

  })

  // ─── Group 4 — Partial success ────────────────────────────────────────────

  describe('Group 4 — partial success', () => {

    it('should send error event section: "summary" and return summary: "" when summarisePage fails', async () => {
      mockSummarisePage.mockResolvedValue(makeSummaryFailure())
      const result = await orchestrate(TEST_URL, false, mockStream as unknown as SseStream, 'test-card-id')
      expect(mockStream.sendEvent).toHaveBeenCalledWith('error', {
        section: 'summary',
        message: 'Summary unavailable for this page',
      })
      expect(result.summary).toBe('')
    })

    it('should send error event section: "tags" and return tags: [] when generateTags fails', async () => {
      mockGenerateTags.mockResolvedValue(makeTagsFailure())
      const result = await orchestrate(TEST_URL, false, mockStream as unknown as SseStream, 'test-card-id')
      expect(mockStream.sendEvent).toHaveBeenCalledWith('error', {
        section: 'tags',
        message: 'Tags unavailable for this page',
      })
      expect(result.tags).toEqual([])
    })

    it('should send an image event and return a non-empty imageUrl even when summary and tags both fail', async () => {
      mockSummarisePage.mockResolvedValue(makeSummaryFailure())
      mockGenerateTags.mockResolvedValue(makeTagsFailure())
      const result = await orchestrate(TEST_URL, false, mockStream as unknown as SseStream, 'test-card-id')
      expect(mockStream.sendEvent).toHaveBeenCalledWith('image', { imageUrl: 'https://example.com/og.png' })
      expect(result.imageUrl).toBe('https://example.com/og.png')
    })

    it('should still call setCached and stream.close() when both summary and tags fail', async () => {
      mockSummarisePage.mockResolvedValue(makeSummaryFailure())
      mockGenerateTags.mockResolvedValue(makeTagsFailure())
      await orchestrate(TEST_URL, false, mockStream as unknown as SseStream, 'test-card-id')
      expect(mockSetCached).toHaveBeenCalledWith(
        TEST_URL,
        expect.objectContaining({ summary: '', tags: [], imageUrl: 'https://example.com/og.png' }),
      )
      expect(mockStream.close).toHaveBeenCalledTimes(1)
    })

  })

  // ─── Group 5 — Streaming order ────────────────────────────────────────────

  describe('Group 5 — streaming order', () => {

    it('should send the title event before any parallel agent events — title is sendEvent call index 0', async () => {
      await orchestrate(TEST_URL, false, mockStream as unknown as SseStream, 'test-card-id')
      const firstCall = mockStream.sendEvent.mock.calls[0]
      expect(firstCall?.[0]).toBe('title')
      expect(firstCall?.[1]).toEqual({ title: 'Scraped Title' })
    })

    it('should call stream.close() only after all agent sendEvent calls — close is last in the call log', async () => {
      const callLog: string[] = []
      mockStream.sendEvent.mockImplementation(async (event) => { callLog.push(event as string) })
      mockStream.close.mockImplementation(() => { callLog.push('__close__') })
      await orchestrate(TEST_URL, false, mockStream as unknown as SseStream, 'test-card-id')
      expect(callLog.at(-1)).toBe('__close__')
      const closeIndex = callLog.indexOf('__close__')
      const imageIndex = callLog.indexOf('image')
      expect(imageIndex).toBeGreaterThan(-1)
      expect(imageIndex).toBeLessThan(closeIndex)
    })

  })

  // ─── Group 6 — setCached fire and forget ─────────────────────────────────

  describe('Group 6 — setCached fire and forget', () => {

    it('should call setCached with the input URL and a complete CachedCard including a numeric cachedAt', async () => {
      await orchestrate(TEST_URL, false, mockStream as unknown as SseStream, 'test-card-id')
      expect(mockSetCached).toHaveBeenCalledWith(
        TEST_URL,
        expect.objectContaining({
          title:    'Scraped Title',
          summary:  'Test summary.',
          tags:     ['tech', 'ai', 'web'],
          imageUrl: 'https://example.com/og.png',
          cachedAt: expect.any(Number),
        }),
      )
    })

    it('should resolve normally and return the correct OrchestratorResult even when setCached rejects', async () => {
      mockSetCached.mockImplementation((_url: string, _card: CachedCard): Promise<void> => {
        const p = Promise.reject<void>(new Error('Redis write failed'))
        p.catch(() => {})
        return p
      })
      const result = await orchestrate(TEST_URL, false, mockStream as unknown as SseStream, 'test-card-id')
      expect(result).toMatchObject({
        title:     'Scraped Title',
        summary:   'Test summary.',
        tags:      ['tech', 'ai', 'web'],
        fromCache: false,
      })
    })

  })

})
