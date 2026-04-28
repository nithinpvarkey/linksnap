// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Result of the free tier daily limit check.
 * remaining is how many summaries the user has left today (0 to 2).
 * Pass remaining to the frontend to keep localStorage in sync with server state.
 */
export type FreeTierResult =
  | { allowed: true;  remaining: number }
  | { allowed: false }

// ─── Private state ────────────────────────────────────────────────────────────

type FreeTierEntry = {
  count: number
  date: string  // UTC date — "YYYY-MM-DD"
}

const freeTierMap = new Map<string, FreeTierEntry>()

const FREE_TIER_MAX = 3

// ─── Private helpers ─────────────────────────────────────────────────────────

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10)
}

// ─── Exported functions ───────────────────────────────────────────────────────

/**
 * Checks whether the IP has remaining free tier summaries for today.
 * Resets automatically at midnight UTC — no cron job required.
 * Records the request if allowed — increments today's count.
 *
 * Prevents: free tier bypass (Threat 10).
 * localStorage on the client is a UX hint only — this is the real gate.
 * Calling the API directly without going through the frontend cannot
 * bypass this check.
 *
 * Returns remaining so the API route can pass it to the frontend,
 * keeping the localStorage counter in sync with server state.
 *
 * Phase 5 improvement: replace in-memory Map with per-account tracking
 * in Supabase once Clerk authentication is added.
 */
export function checkFreeTier(ip: string): FreeTierResult {
  const today = todayUtc()
  const entry = freeTierMap.get(ip)

  // No entry or date has rolled over — start a fresh day for this IP
  if (!entry || entry.date !== today) {
    freeTierMap.set(ip, { count: 1, date: today })
    return { allowed: true, remaining: FREE_TIER_MAX - 1 }
  }

  // Today's entry exists and limit reached — reject
  if (entry.count >= FREE_TIER_MAX) {
    return { allowed: false }
  }

  // Today's entry exists and under limit — record and allow
  entry.count += 1
  return { allowed: true, remaining: FREE_TIER_MAX - entry.count }
}
