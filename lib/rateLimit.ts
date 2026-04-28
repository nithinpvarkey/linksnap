// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Result of the per-minute rate limit check.
 * retryAfter is whole seconds until the current window resets.
 */
export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfter: number }

/**
 * Result of the concurrent request check.
 */
export type ConcurrencyResult =
  | { allowed: true }
  | { allowed: false }

// ─── Private state ────────────────────────────────────────────────────────────

type RateLimitEntry = {
  count: number
  windowStart: number
}

const rateLimitMap = new Map<string, RateLimitEntry>()
const concurrencyMap = new Map<string, number>()

const RATE_LIMIT_MAX = 10
const RATE_LIMIT_WINDOW_MS = 60_000  // 60 seconds
const CONCURRENCY_MAX = 3

// ─── Exported functions ───────────────────────────────────────────────────────

/**
 * Extracts the real client IP address from request headers.
 * Checks x-forwarded-for first (set by Vercel), then x-real-ip,
 * then falls back to "unknown" if neither header is present.
 *
 * "unknown" is a valid key in both limit Maps — treated as a single
 * anonymous client sharing one limit bucket.
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    const ip = forwarded.split(',')[0]?.trim()
    if (ip) return ip
  }

  const realIp = request.headers.get('x-real-ip')
  if (realIp) {
    const ip = realIp.trim()
    if (ip) return ip
  }

  return 'unknown'
}

/**
 * Checks whether the IP has exceeded 10 requests per 60-second window.
 * Records the request if allowed — increments the counter for this window.
 * Cleans up the expired entry for this IP on the next request after expiry,
 * preventing unbounded Map growth over the function instance lifetime.
 *
 * Prevents: rate limit bypass (Threat 8).
 * Call before any AI call or expensive operation — never after.
 *
 * Phase 6 improvement: replace in-memory Map with Vercel KV atomic increment
 * for consistent enforcement across all serverless function instances.
 */
export function checkRateLimit(ip: string): RateLimitResult {
  const now = Date.now()
  const entry = rateLimitMap.get(ip)

  // No entry or window expired — start a fresh window for this IP
  if (!entry || now - entry.windowStart >= RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(ip, { count: 1, windowStart: now })
    return { allowed: true }
  }

  // Within the window and at the limit — reject with retry timing
  if (entry.count >= RATE_LIMIT_MAX) {
    const secondsRemaining = (entry.windowStart + RATE_LIMIT_WINDOW_MS - now) / 1000
    return { allowed: false, retryAfter: Math.max(1, Math.ceil(secondsRemaining)) }
  }

  // Within the window and under the limit — record and allow
  entry.count += 1
  return { allowed: true }
}

/**
 * Checks whether the IP has capacity for another simultaneous request.
 * Only increments the counter if the request is allowed — the counter
 * stays accurate without needing to decrement a request that was never counted.
 *
 * Prevents: concurrency abuse (Threat 9).
 * Call after checkRateLimit passes. Always pair with decrementConcurrency
 * in a finally block to guarantee the slot is released on completion.
 *
 * Phase 6 improvement: replace in-memory Map with Vercel KV for consistency
 * across multiple serverless function instances.
 */
export function incrementConcurrency(ip: string): ConcurrencyResult {
  const current = concurrencyMap.get(ip) ?? 0

  if (current >= CONCURRENCY_MAX) {
    return { allowed: false }
  }

  concurrencyMap.set(ip, current + 1)
  return { allowed: true }
}

/**
 * Releases one concurrency slot for the IP when a request finishes.
 * Safe to call when no entry exists — handles missing or zero entries
 * gracefully to guard against double-decrement bugs.
 * Deletes the entry when the count reaches zero to keep the Map clean.
 *
 * Always call in a finally block after incrementConcurrency returns allowed.
 */
export function decrementConcurrency(ip: string): void {
  const current = concurrencyMap.get(ip)

  if (current === undefined || current <= 1) {
    concurrencyMap.delete(ip)
    return
  }

  concurrencyMap.set(ip, current - 1)
}
