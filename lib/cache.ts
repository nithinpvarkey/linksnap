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

/**
 * The shape of a shareable card stored by ID.
 * Saved once per snap, read by the public /s/[id] page.
 */
export interface ShareableCard {
  id:        string
  url:       string
  title:     string
  summary:   string
  tags:      string[]
  imageUrl:  string
  createdAt: number
}

// ─── Private state ────────────────────────────────────────────────────────────

const redis = new Redis({
  url:   process.env['UPSTASH_REDIS_REST_URL']   ?? '',
  token: process.env['UPSTASH_REDIS_REST_TOKEN'] ?? '',
})

const CACHE_TTL_SECONDS       = 86_400      // 24 hours — URL-based performance cache
const SHAREABLE_CARD_TTL_SECS = 2_592_000   // 30 days  — share links stay valid

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

// ─── Exported functions — URL cache ──────────────────────────────────────────

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

// ─── Exported functions — shareable cards ────────────────────────────────────

/**
 * Saves a shareable card by its ID with a 30-day TTL.
 * Works in all environments so share links function during local development.
 * Never throws — silently fails if Redis is unavailable.
 */
export async function saveCard(
  id:   string,
  data: Omit<ShareableCard, 'id'>,
): Promise<void> {
  try {
    await redis.set(`card:${id}`, { id, ...data }, { ex: SHAREABLE_CARD_TTL_SECS })
  } catch {
    // Share card save failure must never block the SSE response
  }
}

/**
 * Reads a shareable card by its ID, or returns null if not found or expired.
 * Works in all environments so share pages render during local development.
 * Never throws — silently fails if Redis is unavailable.
 */
export async function getCard(id: string): Promise<ShareableCard | null> {
  try {
    return await redis.get<ShareableCard>(`card:${id}`)
  } catch {
    return null
  }
}
