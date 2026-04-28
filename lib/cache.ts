import { Redis } from '@upstash/redis'

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * The shape of a fully assembled card result stored in cache.
 * cachedAt is a Unix timestamp (ms) — useful for debugging staleness.
 */
export interface CachedCard {
  title:    string
  summary:  string
  tags:     string[]
  imageUrl: string
  cachedAt: number
}

// ─── Private state ────────────────────────────────────────────────────────────

const redis = new Redis({
  url:   process.env['UPSTASH_REDIS_REST_URL']   ?? '',
  token: process.env['UPSTASH_REDIS_REST_TOKEN'] ?? '',
})

const CACHE_TTL_SECONDS = 86_400  // 24 hours

const TRACKED_PARAMS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign',
  'utm_term', 'utm_content', 'utm_id',
  'fbclid', 'gclid', 'ref', 'source',
])

// ─── Private helpers ─────────────────────────────────────────────────────────

function normaliseUrl(url: string): string {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return url
  }

  // Lowercase the domain
  parsed.hostname = parsed.hostname.toLowerCase()

  // Strip default ports
  if (
    (parsed.protocol === 'http:'  && parsed.port === '80') ||
    (parsed.protocol === 'https:' && parsed.port === '443')
  ) {
    parsed.port = ''
  }

  // Remove tracking query parameters
  for (const key of Array.from(parsed.searchParams.keys())) {
    if (TRACKED_PARAMS.has(key)) {
      parsed.searchParams.delete(key)
    }
  }

  // Strip trailing slash from path
  parsed.pathname = parsed.pathname.replace(/\/+$/, '') || '/'

  return parsed.toString()
}

// ─── Exported functions ───────────────────────────────────────────────────────

/**
 * Returns a cached card for the URL if one exists, or null on miss or error.
 * No-op in development — always returns null so agents run fresh.
 * Never throws — cache is a performance layer, not a correctness requirement.
 */
export async function getCached(url: string): Promise<CachedCard | null> {
  if (process.env['NODE_ENV'] !== 'production') return null

  const key = normaliseUrl(url)
  try {
    return await redis.get<CachedCard>(key)
  } catch {
    return null
  }
}

/**
 * Stores a fully assembled card in cache with a 24-hour TTL.
 * No-op in development — never caches during local dev.
 * Never throws — silently fails if KV is unavailable.
 */
export async function setCached(url: string, card: CachedCard): Promise<void> {
  if (process.env['NODE_ENV'] !== 'production') return

  const key = normaliseUrl(url)
  try {
    await redis.set(key, card, { ex: CACHE_TTL_SECONDS })
  } catch {
    // Cache failure must never block the response — swallow the error
  }
}
