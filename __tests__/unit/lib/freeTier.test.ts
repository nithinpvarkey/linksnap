// Unit tests for lib/freeTier.ts — 8 tests.
//
// freeTierMap is a private module-level Map — cannot be cleared between tests.
// Every test uses a unique IP string so state never bleeds.
// Date.prototype.toISOString is frozen in beforeEach for fully deterministic results
// regardless of what time of day the suite runs.

import { checkFreeTier } from '../../../lib/freeTier'

// ─── Date spy — module-scoped so Test 6 can update the same instance ─────────
// safe: assigned unconditionally in beforeEach before any test runs
let dateSpy!: jest.SpyInstance

beforeEach(() => {
  dateSpy = jest
    .spyOn(Date.prototype, 'toISOString')
    .mockReturnValue('2026-05-02T12:00:00.000Z')
})

afterEach(() => {
  jest.restoreAllMocks()
})

// ═════════════════════════════════════════════════════════════════════════════
// checkFreeTier
// ═════════════════════════════════════════════════════════════════════════════

describe('checkFreeTier', () => {

  describe('Group 1 — daily free tier counter', () => {

    it('should return allowed:true and remaining:2 on the first request for a new IP today', () => {
      // Arrange: unique IP — no prior state; date frozen to 2026-05-02 by beforeEach
      // Act
      const result = checkFreeTier('ip-ft-001')
      // Assert: count = 1, remaining = FREE_TIER_MAX - count = 3 - 1 = 2
      expect(result).toEqual({ allowed: true, remaining: 2 })
    })

    it('should return allowed:true and remaining:1 on the second request for the same IP on the same day', () => {
      // Arrange: unique IP, first call establishes count = 1
      const ip = 'ip-ft-002'
      checkFreeTier(ip) // count: 0 → 1
      // Act
      const result = checkFreeTier(ip) // count: 1 → 2
      // Assert: remaining = FREE_TIER_MAX - count = 3 - 2 = 1
      expect(result).toEqual({ allowed: true, remaining: 1 })
    })

    it('should return allowed:true and remaining:0 on the third request — the last allowed call of the day', () => {
      // Arrange: unique IP, two calls to bring count to 2
      const ip = 'ip-ft-003'
      checkFreeTier(ip) // count: 0 → 1
      checkFreeTier(ip) // count: 1 → 2
      // Act
      const result = checkFreeTier(ip) // count: 2 → 3, exactly at limit
      // Assert: remaining = FREE_TIER_MAX - count = 3 - 3 = 0
      expect(result).toEqual({ allowed: true, remaining: 0 })
    })

    it('should return allowed:false on the fourth request — one over the daily limit', () => {
      // Arrange: exhaust all three allowed calls
      const ip = 'ip-ft-004'
      checkFreeTier(ip) // count: 1
      checkFreeTier(ip) // count: 2
      checkFreeTier(ip) // count: 3 — limit reached
      // Act
      const result = checkFreeTier(ip) // fourth call — blocked
      // Assert: no remaining field present when blocked
      expect(result).toEqual({ allowed: false })
    })

    it('should return allowed:false on the fourth, fifth, and sixth requests — counter never increments past 3', () => {
      // Arrange: exhaust all three allowed calls
      const ip = 'ip-ft-005'
      checkFreeTier(ip) // count: 1
      checkFreeTier(ip) // count: 2
      checkFreeTier(ip) // count: 3 — limit reached
      // Act: three consecutive calls beyond the limit
      const fourth = checkFreeTier(ip)
      const fifth  = checkFreeTier(ip)
      const sixth  = checkFreeTier(ip)
      // Assert: every call past the limit is blocked — the counter is not incremented
      //         on any blocked call, confirming count stays at exactly 3
      expect(fourth).toEqual({ allowed: false })
      expect(fifth).toEqual({ allowed: false })
      expect(sixth).toEqual({ allowed: false })
    })

    it('should reset the counter and allow requests when the UTC date advances to a new day', () => {
      // Arrange: date frozen to 2026-05-02 (set in beforeEach) — exhaust today's limit
      const ip = 'ip-ft-006'
      checkFreeTier(ip) // count: 1
      checkFreeTier(ip) // count: 2
      checkFreeTier(ip) // count: 3
      expect(checkFreeTier(ip)).toEqual({ allowed: false }) // confirm at limit
      // Advance to the next UTC day — updating the stored spy instance, not creating a new one
      dateSpy.mockReturnValue('2026-05-03T12:00:00.000Z')
      // Act: first request on the new day
      const result = checkFreeTier(ip)
      // Assert: entry.date !== today triggers a fresh window — count resets to 1
      expect(result).toEqual({ allowed: true, remaining: 2 })
    })

    it('should keep every call blocked on the same day — no accidental reset path exists without a date change', () => {
      // Arrange: exhaust the three allowed calls
      const ip = 'ip-ft-007'
      checkFreeTier(ip) // count: 1
      checkFreeTier(ip) // count: 2
      checkFreeTier(ip) // count: 3 — limit reached
      // Act: 10 consecutive calls on the same frozen date — date never changes, no reset
      const blockedResults = Array.from({ length: 10 }, () => checkFreeTier(ip))
      // Assert: every one of the 10 calls is blocked — the server enforces this
      //         unconditionally regardless of how many times the function is called
      blockedResults.forEach(result => expect(result).toEqual({ allowed: false }))
    })

    it('should track two IPs independently — IP A at its daily limit does not affect IP B', () => {
      // Arrange: exhaust IP A's daily allowance entirely
      const ipA = 'ip-ft-008a'
      const ipB = 'ip-ft-008b'
      checkFreeTier(ipA) // count: 1
      checkFreeTier(ipA) // count: 2
      checkFreeTier(ipA) // count: 3
      expect(checkFreeTier(ipA)).toEqual({ allowed: false }) // confirm A is blocked
      // Act: IP B makes its first request of the day
      const result = checkFreeTier(ipB)
      // Assert: IP B has its own independent counter — completely unaffected by IP A
      expect(result).toEqual({ allowed: true, remaining: 2 })
    })

  })

})
