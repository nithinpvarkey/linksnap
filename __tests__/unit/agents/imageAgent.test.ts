// Unit tests for agents/imageAgent.ts — 6 tests across 3 groups.
//
// findImage makes no network calls — it reads ogImage directly from the
// scraperResult. No mocks, no fetch spy, no env vars required.
// @/lib/security is not imported by this agent so no mock is needed.

import { findImage } from '../../../agents/imageAgent'
import type { ScraperResult } from '@/lib/types'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeScraperResult(overrides: Partial<ScraperResult> = {}): ScraperResult {
  return {
    title:   'Test Page Title',
    text:    'Test page body text.',
    ogImage: 'https://example.com/og.png',
    favicon: 'https://example.com/favicon.ico',
    url:     'https://example.com/',
    ...overrides,
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// findImage
// ═════════════════════════════════════════════════════════════════════════════

describe('findImage', () => {

  // ─── Group 1 — og:image passthrough ──────────────────────────────────────

  describe('Group 1 — og:image passthrough', () => {

    it('should return scraperResult.ogImage as imageUrl', async () => {
      // Arrange
      const scraperResult = makeScraperResult({ ogImage: 'https://cdn.example.com/og.jpg' })
      // Act
      const result = await findImage(scraperResult, 'https://example.com/', '', 'Title')
      // Assert
      expect(result).toMatchObject({
        success:    true,
        source:     'primary',
        durationMs: expect.any(Number),
        data:       { imageUrl: 'https://cdn.example.com/og.jpg' },
      })
      expect(result.durationMs).toBeGreaterThanOrEqual(0)
    })

    it('should return imageUrl: "" when ogImage is an empty string', async () => {
      // Arrange
      const scraperResult = makeScraperResult({ ogImage: '' })
      // Act
      const result = await findImage(scraperResult, 'https://example.com/', '', 'Title')
      // Assert
      expect(result).toMatchObject({ success: true, data: { imageUrl: '' } })
    })

    it('should trim whitespace from ogImage', async () => {
      // Arrange
      const scraperResult = makeScraperResult({ ogImage: '  https://example.com/og.png  ' })
      // Act
      const result = await findImage(scraperResult, 'https://example.com/', '', 'Title')
      // Assert
      if (result.success) {
        expect(result.data.imageUrl).toBe('https://example.com/og.png')
      }
    })

  })

  // ─── Group 2 — AgentResult shape ─────────────────────────────────────────

  describe('Group 2 — AgentResult shape', () => {

    it('should return success: true, source: "primary", and durationMs >= 0', async () => {
      // Arrange
      const scraperResult = makeScraperResult()
      // Act
      const result = await findImage(scraperResult, 'https://example.com/', '', 'Title')
      // Assert
      expect(result.success).toBe(true)
      expect(result.source).toBe('primary')
      expect(result.durationMs).toBeGreaterThanOrEqual(0)
    })

    it('should return success: true even when ogImage is empty — empty imageUrl is not a failure', async () => {
      // Arrange
      const scraperResult = makeScraperResult({ ogImage: '' })
      // Act
      const result = await findImage(scraperResult, 'https://example.com/', '', 'Title')
      // Assert
      expect(result.success).toBe(true)
    })

  })

  // ─── Group 3 — Unused parameters ─────────────────────────────────────────

  describe('Group 3 — unused parameters', () => {

    it('should return the same imageUrl regardless of url, summary, and title values', async () => {
      // Arrange: only scraperResult.ogImage affects output
      const scraperResult = makeScraperResult({ ogImage: 'https://example.com/og.png' })
      // Act: different url/summary/title on each call
      const result1 = await findImage(scraperResult, 'https://different.com/', 'any summary', 'any title')
      const result2 = await findImage(scraperResult, 'https://other.com/',     '',             ''          )
      // Assert
      if (result1.success) expect(result1.data.imageUrl).toBe('https://example.com/og.png')
      if (result2.success) expect(result2.data.imageUrl).toBe('https://example.com/og.png')
    })

  })

})
