// Unit tests for lib/cache.ts — 22 tests across 3 groups.
//
// @upstash/redis is mocked at the factory level. _mockGet and _mockSet are
// shared fn references exported alongside the Redis constructor, avoiding the
// jest.mock hoisting problem. Accessed via jest.requireMock with explicit types.
// process.env['NODE_ENV'] is set per-test and restored to 'test' in afterEach.

import { getCached, setCached, type CachedCard } from '../../../lib/cache'

// ─── Mock: @upstash/redis ─────────────────────────────────────────────────────
//
// get and set are closures created once inside the factory — the same function
// objects the redis instance will hold. Exported as _mockGet/_mockSet so they
// can be retrieved via jest.requireMock after hoisting resolves.

jest.mock('@upstash/redis', () => {
  const get = jest.fn()
  const set = jest.fn()
  return {
    Redis:    jest.fn().mockImplementation(() => ({ get, set })),
    _mockGet: get,
    _mockSet: set,
  }
})

const { _mockGet: mockGet, _mockSet: mockSet } =
  jest.requireMock<{
    Redis:    jest.Mock
    _mockGet: jest.MockedFunction<(key: string) => Promise<CachedCard | null>>
    _mockSet: jest.MockedFunction<(key: string, value: CachedCard, opts: { ex: number }) => Promise<unknown>>
  }>('@upstash/redis')

// ─── Lifecycle ───────────────────────────────────────────────────────────────

beforeEach(() => {
  mockGet.mockReset()
  mockSet.mockReset()
})

afterEach(() => {
  // @types/node@20 marks NODE_ENV readonly — Object.assign bypasses that constraint
  Object.assign(process.env, { NODE_ENV: 'test' })
})

// ─── Fixture ─────────────────────────────────────────────────────────────────

const CARD: CachedCard = {
  title:    'Test Page',
  summary:  'A two-line summary.',
  tags:     ['tag1', 'tag2', 'tag3'],
  imageUrl: 'https://example.com/image.png',
  cachedAt: 1_700_000_000_000,
}

// ═════════════════════════════════════════════════════════════════════════════
// normaliseUrl — tested indirectly via getCached cache-key argument
// ═════════════════════════════════════════════════════════════════════════════

describe('normaliseUrl', () => {

  describe('Group 1 — URL normalisation verified via getCached cache-key argument', () => {

    beforeEach(() => {
      Object.assign(process.env, { NODE_ENV: 'production' })
      mockGet.mockResolvedValue(null)
    })

    it('should strip utm_source from the cache key', async () => {
      // Arrange
      const url = 'https://example.com/?utm_source=google'
      // Act
      await getCached(url)
      // Assert
      expect(mockGet.mock.calls[0]?.[0]).toBe('https://example.com/')
    })

    it('should strip utm_medium from the cache key', async () => {
      // Arrange
      const url = 'https://example.com/?utm_medium=cpc'
      // Act
      await getCached(url)
      // Assert
      expect(mockGet.mock.calls[0]?.[0]).toBe('https://example.com/')
    })

    it('should strip utm_campaign from the cache key', async () => {
      // Arrange
      const url = 'https://example.com/?utm_campaign=spring'
      // Act
      await getCached(url)
      // Assert
      expect(mockGet.mock.calls[0]?.[0]).toBe('https://example.com/')
    })

    it('should strip fbclid from the cache key', async () => {
      // Arrange
      const url = 'https://example.com/?fbclid=abc123'
      // Act
      await getCached(url)
      // Assert
      expect(mockGet.mock.calls[0]?.[0]).toBe('https://example.com/')
    })

    it('should strip gclid from the cache key', async () => {
      // Arrange
      const url = 'https://example.com/?gclid=xyz789'
      // Act
      await getCached(url)
      // Assert
      expect(mockGet.mock.calls[0]?.[0]).toBe('https://example.com/')
    })

    it('should strip ref from the cache key', async () => {
      // Arrange
      const url = 'https://example.com/?ref=twitter'
      // Act
      await getCached(url)
      // Assert
      expect(mockGet.mock.calls[0]?.[0]).toBe('https://example.com/')
    })

    it('should strip source from the cache key', async () => {
      // Arrange
      const url = 'https://example.com/?source=newsletter'
      // Act
      await getCached(url)
      // Assert
      expect(mockGet.mock.calls[0]?.[0]).toBe('https://example.com/')
    })

    it('should strip all ten tracking params when present together', async () => {
      // Arrange: full TRACKED_PARAMS set — utm_source, utm_medium, utm_campaign,
      //          utm_term, utm_content, utm_id, fbclid, gclid, ref, source
      const url =
        'https://example.com/?' +
        'utm_source=a&utm_medium=b&utm_campaign=c&utm_term=d&utm_content=e' +
        '&utm_id=f&fbclid=g&gclid=h&ref=i&source=j'
      // Act
      await getCached(url)
      // Assert: every tracked param stripped — bare origin with root slash remains
      expect(mockGet.mock.calls[0]?.[0]).toBe('https://example.com/')
    })

    it('should preserve non-tracking query params in the cache key', async () => {
      // Arrange: q and page are not in TRACKED_PARAMS
      const url = 'https://example.com/?q=search&page=2'
      // Act
      await getCached(url)
      // Assert: both params remain — order preserved
      expect(mockGet.mock.calls[0]?.[0]).toBe('https://example.com/?q=search&page=2')
    })

    it('should lowercase the domain in the cache key', async () => {
      // Arrange: uppercase hostname
      const url = 'https://EXAMPLE.COM/path'
      // Act
      await getCached(url)
      // Assert
      expect(mockGet.mock.calls[0]?.[0]).toBe('https://example.com/path')
    })

    it('should strip a trailing slash from a non-root path in the cache key', async () => {
      // Arrange
      const url = 'https://example.com/path/'
      // Act
      await getCached(url)
      // Assert
      expect(mockGet.mock.calls[0]?.[0]).toBe('https://example.com/path')
    })

    it('should strip the default port :80 from an http URL in the cache key', async () => {
      // Arrange
      const url = 'http://example.com:80/path'
      // Act
      await getCached(url)
      // Assert
      expect(mockGet.mock.calls[0]?.[0]).toBe('http://example.com/path')
    })

    it('should strip the default port :443 from an https URL in the cache key', async () => {
      // Arrange
      const url = 'https://example.com:443/path'
      // Act
      await getCached(url)
      // Assert
      expect(mockGet.mock.calls[0]?.[0]).toBe('https://example.com/path')
    })

    it('should preserve a non-default port :8080 in the cache key', async () => {
      // Arrange
      const url = 'https://example.com:8080/path'
      // Act
      await getCached(url)
      // Assert
      expect(mockGet.mock.calls[0]?.[0]).toBe('https://example.com:8080/path')
    })

    it('should produce the same cache key for a URL with and without utm_source — both calls reach Redis with identical arguments', async () => {
      // Arrange: two URLs that normalise to the same key
      const withTracking    = 'https://example.com/?utm_source=a'
      const withoutTracking = 'https://example.com/'
      // Act
      await getCached(withTracking)
      await getCached(withoutTracking)
      // Assert: both calls passed the same normalised key to redis.get
      const firstKey  = mockGet.mock.calls[0]?.[0]
      const secondKey = mockGet.mock.calls[1]?.[0]
      expect(firstKey).toBe('https://example.com/')
      expect(secondKey).toBe('https://example.com/')
      expect(firstKey).toBe(secondKey)
    })

  })

})

// ═════════════════════════════════════════════════════════════════════════════
// getCached
// ═════════════════════════════════════════════════════════════════════════════

describe('getCached', () => {

  describe('Group 2 — getCached behaviour', () => {

    it('should return null in development without calling redis.get', async () => {
      // Arrange: NODE_ENV is 'test' by default — not production
      // Act
      const result = await getCached('https://example.com/')
      // Assert: early return — Redis never called
      expect(result).toBeNull()
      expect(mockGet).not.toHaveBeenCalled()
    })

    it('should return null on a cache miss in production', async () => {
      // Arrange
      Object.assign(process.env, { NODE_ENV: 'production' })
      mockGet.mockResolvedValue(null)
      // Act
      const result = await getCached('https://example.com/')
      // Assert
      expect(result).toBeNull()
    })

    it('should return the CachedCard on a cache hit in production', async () => {
      // Arrange
      Object.assign(process.env, { NODE_ENV: 'production' })
      mockGet.mockResolvedValue(CARD)
      // Act
      const result = await getCached('https://example.com/')
      // Assert: exact card object returned
      expect(result).toEqual(CARD)
    })

    it('should return null and never throw when redis.get rejects in production', async () => {
      // Arrange
      Object.assign(process.env, { NODE_ENV: 'production' })
      mockGet.mockRejectedValue(new Error('KV unavailable'))
      // Act & Assert: cache is a performance layer — errors must be swallowed
      await expect(getCached('https://example.com/')).resolves.toBeNull()
    })

  })

})

// ═════════════════════════════════════════════════════════════════════════════
// setCached
// ═════════════════════════════════════════════════════════════════════════════

describe('setCached', () => {

  describe('Group 3 — setCached behaviour', () => {

    it('should be a no-op in development — redis.set is never called', async () => {
      // Arrange: NODE_ENV is 'test' by default — not production
      // Act
      await setCached('https://example.com/', CARD)
      // Assert: early return — Redis never called
      expect(mockSet).not.toHaveBeenCalled()
    })

    it('should call redis.set with the normalised key, card, and TTL of exactly 86_400 in production', async () => {
      // Arrange
      Object.assign(process.env, { NODE_ENV: 'production' })
      mockSet.mockResolvedValue('OK')
      // Act: URL with tracking param — key must be normalised before storage
      await setCached('https://example.com/?utm_source=test', CARD)
      // Assert: utm_source stripped from key, TTL is 86_400 seconds (24 hours)
      expect(mockSet).toHaveBeenCalledWith(
        'https://example.com/',
        CARD,
        { ex: 86_400 },
      )
    })

    it('should resolve undefined and never throw when redis.set rejects in production', async () => {
      // Arrange
      Object.assign(process.env, { NODE_ENV: 'production' })
      mockSet.mockRejectedValue(new Error('KV write failed'))
      // Act & Assert: cache failure must never block the response
      await expect(setCached('https://example.com/', CARD)).resolves.toBeUndefined()
    })

  })

})
