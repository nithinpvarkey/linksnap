// Unit tests for agents/imageAgent.ts — 10 tests across 4 groups.
//
// No mocks required. findImage is a synchronous pure function with no
// network calls and no AI APIs. extractDomain from @/lib/security is a
// pure URL utility — it runs without mocking. ScraperResult objects are
// constructed directly using the makeScraperResult helper.
//
// findImage now returns a Pollinations.ai URL built from the summary.
// ScraperResult.ogImage and .favicon are no longer used — they remain
// in the signature for API consistency and future use.

import { findImage } from '../../../agents/imageAgent'
import type { ScraperResult } from '@/lib/types'

// ─── Helper ───────────────────────────────────────────────────────────────────

function makeScraperResult(overrides: Partial<ScraperResult> = {}): ScraperResult {
  return {
    title:   'Test Page Title',
    text:    'Test page body text.',
    ogImage: '',
    favicon: '',
    url:     'https://example.com/',
    ...overrides,
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// findImage
// ═════════════════════════════════════════════════════════════════════════════

describe('findImage', () => {

  // ─── Group 1 — Pollinations URL format ───────────────────────────────────

  describe('Group 1 — Pollinations URL format', () => {

    it('should always return a Pollinations image URL regardless of scraperResult image fields', () => {
      // Arrange: ogImage and favicon both set — they no longer affect output
      const scraperResult = makeScraperResult({
        ogImage: 'https://example.com/og.png',
        favicon: 'https://example.com/favicon.ico',
      })
      // Act
      const result = findImage(scraperResult, 'https://example.com/', 'A test summary.')
      // Assert: imageUrl always points to Pollinations regardless of scraperResult
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.imageUrl).toContain('image.pollinations.ai/prompt/')
        expect(result.data.imageUrl).not.toContain('og.png')
        expect(result.data.imageUrl).not.toContain('favicon.ico')
      }
    })

    it('should include width=1200, height=630, and nologo=true in the URL', () => {
      // Arrange
      const scraperResult = makeScraperResult()
      // Act
      const result = findImage(scraperResult, 'https://example.com/', 'A test summary.')
      // Assert: all required Pollinations query params present
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.imageUrl).toContain('width=1200')
        expect(result.data.imageUrl).toContain('height=630')
        expect(result.data.imageUrl).toContain('nologo=true')
      }
    })

    it('should include a numeric seed query param derived from the URL', () => {
      // Arrange
      const scraperResult = makeScraperResult()
      // Act
      const result = findImage(scraperResult, 'https://example.com/', 'A test summary.')
      // Assert: seed is present and is a non-negative integer
      expect(result.success).toBe(true)
      if (result.success) {
        const match = result.data.imageUrl.match(/seed=(\d+)/)
        expect(match).not.toBeNull()
        if (match !== null) {
          const seed = parseInt(match[1] ?? '0', 10)
          expect(seed).toBeGreaterThanOrEqual(0)
        }
      }
    })

  })

  // ─── Group 2 — AgentResult shape ─────────────────────────────────────────

  describe('Group 2 — AgentResult shape', () => {

    it('should return success: true, source: "primary", and a numeric durationMs', () => {
      // Arrange
      const scraperResult = makeScraperResult()
      // Act
      const result = findImage(scraperResult, 'https://example.com/', 'A test summary.')
      // Assert
      expect(result).toMatchObject({
        success:    true,
        source:     'primary',
        durationMs: expect.any(Number),
      })
      expect(result.durationMs).toBeGreaterThanOrEqual(0)
    })

    it('should return success: true even when scraperResult images are empty and summary is empty', () => {
      // Arrange: worst-case input — no images, no summary
      const scraperResult = makeScraperResult({ ogImage: '', favicon: '' })
      // Act
      const result = findImage(scraperResult, 'https://example.com/', '')
      // Assert: always succeeds — domain fallback guarantees a valid URL
      expect(result).toMatchObject({
        success:    true,
        source:     'primary',
        durationMs: expect.any(Number),
      })
      expect(result.durationMs).toBeGreaterThanOrEqual(0)
    })

  })

  // ─── Group 3 — Synchronous return ────────────────────────────────────────

  describe('Group 3 — synchronous return', () => {

    it('should return a plain object immediately without await — not a Promise', () => {
      // Arrange
      const scraperResult = makeScraperResult()
      // Act: no await — result must be available synchronously
      const result = findImage(scraperResult, 'https://example.com/', 'A test summary.')
      // Assert: Promises have a .then property; plain objects do not
      expect(result).not.toHaveProperty('then')
      expect(result.success).toBe(true)
    })

  })

  // ─── Group 4 — Prompt construction ───────────────────────────────────────

  describe('Group 4 — prompt construction', () => {

    it('should encode the summary text into the Pollinations prompt path', () => {
      // Arrange
      const scraperResult = makeScraperResult()
      const summary       = 'Vercel is a cloud deployment platform.'
      // Act
      const result = findImage(scraperResult, 'https://example.com/', summary)
      // Assert: summary words appear encoded in the URL path
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.imageUrl).toContain(encodeURIComponent('Vercel is a cloud'))
      }
    })

    it('should fall back to the domain name in the prompt when summary is empty', () => {
      // Arrange
      const scraperResult = makeScraperResult()
      // Act: empty summary triggers domain fallback
      const result = findImage(scraperResult, 'https://example.com/', '')
      // Assert: domain appears in the encoded prompt
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.imageUrl).toContain(encodeURIComponent('example.com'))
      }
    })

    it('should keep the URL at a reasonable length when summary is 500 chars — the max from sanitiseAiOutput', () => {
      // Arrange
      const scraperResult = makeScraperResult()
      const longSummary   = 'A'.repeat(500)
      // Act
      const result = findImage(scraperResult, 'https://example.com/', longSummary)
      // Assert: prompt is capped at 200 chars before encoding — URL stays manageable
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.imageUrl.length).toBeLessThan(2_000)
      }
    })

    it('should return the same URL for identical inputs — seed and prompt are deterministic', () => {
      // Arrange
      const scraperResult = makeScraperResult()
      const summary       = 'A consistent summary for determinism testing.'
      // Act: two calls with identical args
      const result1 = findImage(scraperResult, 'https://example.com/', summary)
      const result2 = findImage(scraperResult, 'https://example.com/', summary)
      // Assert: output is identical — same seed, same prompt, same URL
      expect(result1.success).toBe(true)
      expect(result2.success).toBe(true)
      if (result1.success && result2.success) {
        expect(result1.data.imageUrl).toBe(result2.data.imageUrl)
      }
    })

  })

})
