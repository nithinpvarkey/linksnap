// Unit tests for lib/rateLimit.ts — 19 tests across 4 groups.
//
// rateLimitMap and concurrencyMap are private module-level Maps — they cannot be
// cleared between tests. Every test uses a unique IP string so state never bleeds.

import {
  getClientIp,
  checkRateLimit,
  incrementConcurrency,
  decrementConcurrency,
} from '../../../lib/rateLimit'

// ─── Helper ───────────────────────────────────────────────────────────────────

/** Build a Request with the given headers. Node 25 exposes Request as a global. */
function makeRequest(headers: Record<string, string>): Request {
  return new Request('https://example.com', { headers })
}

// ═════════════════════════════════════════════════════════════════════════════
// getClientIp
// ═════════════════════════════════════════════════════════════════════════════

describe('getClientIp', () => {

  describe('Group 1 — client IP extraction from request headers', () => {
    it('should return the IP from x-forwarded-for when a single IP is present', () => {
      // Arrange
      const request = makeRequest({ 'x-forwarded-for': '1.2.3.4' })
      // Act
      const ip = getClientIp(request)
      // Assert
      expect(ip).toBe('1.2.3.4')
    })

    it('should return only the first IP when x-forwarded-for contains multiple comma-separated IPs', () => {
      // Arrange: Vercel prepends the real client IP — the rest are intermediate proxies
      const request = makeRequest({ 'x-forwarded-for': '1.2.3.4, 10.0.0.1, 192.168.1.1' })
      // Act
      const ip = getClientIp(request)
      // Assert: only the leftmost (real client) IP is returned
      expect(ip).toBe('1.2.3.4')
    })

    it('should return the x-real-ip value when x-forwarded-for is absent', () => {
      // Arrange
      const request = makeRequest({ 'x-real-ip': '5.6.7.8' })
      // Act
      const ip = getClientIp(request)
      // Assert
      expect(ip).toBe('5.6.7.8')
    })

    it('should return "unknown" when neither x-forwarded-for nor x-real-ip is present', () => {
      // Arrange
      const request = makeRequest({})
      // Act
      const ip = getClientIp(request)
      // Assert
      expect(ip).toBe('unknown')
    })

    it('should fall through to x-real-ip when x-forwarded-for is an empty string', () => {
      // Arrange: empty string is falsy — the if (forwarded) guard skips it cleanly
      const request = makeRequest({ 'x-forwarded-for': '', 'x-real-ip': '5.6.7.8' })
      // Act
      const ip = getClientIp(request)
      // Assert: fallback to x-real-ip succeeded
      expect(ip).toBe('5.6.7.8')
    })
  })

})

// ═════════════════════════════════════════════════════════════════════════════
// checkRateLimit
// ═════════════════════════════════════════════════════════════════════════════

describe('checkRateLimit', () => {

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('Group 2 — per-IP sliding window rate limiting', () => {
    it('should allow the first request from a new IP', () => {
      // Arrange: unique IP — no prior state in rateLimitMap
      // Act
      const result = checkRateLimit('ip-ratelimit-001')
      // Assert
      expect(result).toEqual({ allowed: true })
    })

    it('should allow all 10 requests within a single 60-second window', () => {
      // Arrange
      const ip = 'ip-ratelimit-002'
      // Act: fire all 10 within the same window
      const results = Array.from({ length: 10 }, () => checkRateLimit(ip))
      // Assert: every request up to the limit is allowed
      results.forEach(result => expect(result.allowed).toBe(true))
    })

    it('should block the 11th request in the same window and include a retryAfter greater than 0', () => {
      // Arrange: exhaust the 10-request allowance
      const ip = 'ip-ratelimit-003'
      for (let i = 0; i < 10; i++) checkRateLimit(ip)
      // Act
      const result = checkRateLimit(ip)
      // Assert
      expect(result.allowed).toBe(false)
      if (result.allowed === false) {
        expect(result.retryAfter).toBeGreaterThan(0)
      }
    })

    it('should reset the counter and allow requests after the 60-second window expires', () => {
      // Arrange: freeze time, exhaust the window
      const T = 1_700_000_000_000
      const dateSpy = jest.spyOn(Date, 'now').mockReturnValue(T)
      const ip = 'ip-ratelimit-004'
      for (let i = 0; i < 10; i++) checkRateLimit(ip)
      expect(checkRateLimit(ip).allowed).toBe(false) // confirm at limit
      // Advance past the 60-second window boundary
      dateSpy.mockReturnValue(T + 60_001)
      // Act: first request in the new window
      const result = checkRateLimit(ip)
      // Assert: fresh window starts — allowed, count resets to 1
      expect(result).toEqual({ allowed: true })
    })

    it('should return retryAfter of exactly 1 when only 1ms remains in the window — never returns 0', () => {
      // Arrange: freeze time at T, fill the window to the limit
      const T = 1_700_000_000_000
      const dateSpy = jest.spyOn(Date, 'now').mockReturnValue(T)
      const ip = 'ip-ratelimit-005'
      for (let i = 0; i < 10; i++) checkRateLimit(ip)
      // Advance to 1ms before window end:
      //   secondsRemaining = (T + 60_000 - (T + 59_999)) / 1000 = 0.001
      //   Math.max(1, Math.ceil(0.001)) = Math.max(1, 1) = 1
      dateSpy.mockReturnValue(T + 59_999)
      // Act
      const result = checkRateLimit(ip)
      // Assert
      expect(result.allowed).toBe(false)
      if (result.allowed === false) {
        expect(result.retryAfter).toBe(1)
      }
    })

    it('should track two IPs independently — one IP at its limit does not block a different IP', () => {
      // Arrange: exhaust IP A's entire allowance
      const ipA = 'ip-ratelimit-006a'
      const ipB = 'ip-ratelimit-006b'
      for (let i = 0; i < 11; i++) checkRateLimit(ipA)
      expect(checkRateLimit(ipA).allowed).toBe(false) // confirm A is blocked
      // Act: IP B makes its first request
      const result = checkRateLimit(ipB)
      // Assert: IP B has its own independent counter — unaffected by A
      expect(result).toEqual({ allowed: true })
    })
  })

})

// ═════════════════════════════════════════════════════════════════════════════
// incrementConcurrency
// ═════════════════════════════════════════════════════════════════════════════

describe('incrementConcurrency', () => {

  describe('Group 3 — per-IP concurrent request limiting', () => {
    it('should allow the first concurrent request for a new IP', () => {
      // Act
      const result = incrementConcurrency('ip-conc-001')
      // Assert
      expect(result).toEqual({ allowed: true })
    })

    it('should allow all three concurrent requests up to CONCURRENCY_MAX of 3', () => {
      // Arrange: fresh IP — all three slots available
      const ip = 'ip-conc-002'
      // Act
      const first  = incrementConcurrency(ip)
      const second = incrementConcurrency(ip)
      const third  = incrementConcurrency(ip)
      // Assert: every slot up to the maximum is granted
      expect(first).toEqual({ allowed: true })
      expect(second).toEqual({ allowed: true })
      expect(third).toEqual({ allowed: true })
    })

    it('should block the fourth concurrent request when all three slots are occupied', () => {
      // Arrange: fill all three slots
      const ip = 'ip-conc-003'
      incrementConcurrency(ip)
      incrementConcurrency(ip)
      incrementConcurrency(ip)
      // Act
      const result = incrementConcurrency(ip)
      // Assert
      expect(result).toEqual({ allowed: false })
    })

    it('should not increment the counter on a blocked call — a fifth call is also blocked', () => {
      // Arrange: fill all three slots and confirm the fourth is blocked
      const ip = 'ip-conc-004'
      incrementConcurrency(ip)
      incrementConcurrency(ip)
      incrementConcurrency(ip)
      expect(incrementConcurrency(ip)).toEqual({ allowed: false }) // 4th — blocked
      // Act: fifth call — count must still be 3, not 4
      const fifth = incrementConcurrency(ip)
      // Assert: still blocked — counter was not incremented on the blocked 4th call
      expect(fifth).toEqual({ allowed: false })
    })
  })

})

// ═════════════════════════════════════════════════════════════════════════════
// decrementConcurrency
// ═════════════════════════════════════════════════════════════════════════════

describe('decrementConcurrency', () => {

  describe('Group 4 — concurrency slot release', () => {
    it('should free one slot when decremented from a count of 3 — a new increment is then allowed', () => {
      // Arrange: fill all three slots so any new increment is blocked
      const ip = 'ip-decr-001'
      incrementConcurrency(ip)
      incrementConcurrency(ip)
      incrementConcurrency(ip)
      expect(incrementConcurrency(ip)).toEqual({ allowed: false }) // confirm full at 3
      // Act: release one slot
      decrementConcurrency(ip) // count: 3 → 2
      // Assert: one slot freed — a new increment succeeds
      expect(incrementConcurrency(ip)).toEqual({ allowed: true }) // count: 2 → 3
    })

    it('should delete the map entry entirely when decremented from a count of 1', () => {
      // Arrange: only one slot in use
      const ip = 'ip-decr-002'
      incrementConcurrency(ip) // count: 0 → 1
      // Act
      decrementConcurrency(ip) // count: 1 → entry deleted
      // Assert: entry is gone — three fresh increments all succeed from a clean slate
      expect(incrementConcurrency(ip)).toEqual({ allowed: true })  // count: 1
      expect(incrementConcurrency(ip)).toEqual({ allowed: true })  // count: 2
      expect(incrementConcurrency(ip)).toEqual({ allowed: true })  // count: 3
      // If the entry had merely been set to 0 instead of deleted, behaviour would be
      // the same — the test confirms at minimum that three slots are usable after decrement
    })

    it('should not throw or crash when called on an IP with no existing map entry', () => {
      // Arrange: IP has never been seen — no entry exists in concurrencyMap
      // Act & Assert: must be a safe no-op
      expect(() => decrementConcurrency('ip-decr-003-never-seen')).not.toThrow()
    })

    it('should be safe to call twice in a row — second call on a deleted entry does not crash', () => {
      // Arrange: one slot in use
      const ip = 'ip-decr-004'
      incrementConcurrency(ip)    // count: 0 → 1
      decrementConcurrency(ip)    // count: 1 → entry deleted
      // Act: second decrement on a now-absent entry
      // Assert: safe no-op — no throw, no negative count
      expect(() => decrementConcurrency(ip)).not.toThrow()
    })
  })

})
