// Unit tests for agents/imageAgent.ts — 8 tests across 4 groups.
//
// No mocks required. findImage is a synchronous pure function with no
// network calls and no AI APIs. extractDomain from @/lib/security is a
// pure URL utility — it runs without mocking. ScraperResult objects are
// constructed directly using the makeScraperResult helper.

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

  // ─── Group 1 — Image selection priority ──────────────────────────────────

  describe('Group 1 — image selection priority', () => {

    it('should return ogImage when ogImage is set and favicon is empty', () => {
      // Arrange
      const scraperResult = makeScraperResult({
        ogImage: 'https://example.com/og.png',
        favicon: '',
      })
      // Act
      const result = findImage(scraperResult, 'https://example.com/')
      // Assert
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.imageUrl).toBe('https://example.com/og.png')
      }
    })

    it('should return favicon when ogImage is empty and favicon is set', () => {
      // Arrange
      const scraperResult = makeScraperResult({
        ogImage: '',
        favicon: 'https://example.com/favicon.ico',
      })
      // Act
      const result = findImage(scraperResult, 'https://example.com/')
      // Assert
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.imageUrl).toBe('https://example.com/favicon.ico')
      }
    })

    it('should return an empty string when both ogImage and favicon are empty', () => {
      // Arrange
      const scraperResult = makeScraperResult({ ogImage: '', favicon: '' })
      // Act
      const result = findImage(scraperResult, 'https://example.com/')
      // Assert
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.imageUrl).toBe('')
      }
    })

    it('should return ogImage and not favicon when both are set — ogImage takes priority', () => {
      // Arrange
      const scraperResult = makeScraperResult({
        ogImage: 'https://example.com/og.png',
        favicon: 'https://example.com/favicon.ico',
      })
      // Act
      const result = findImage(scraperResult, 'https://example.com/')
      // Assert
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.imageUrl).toBe('https://example.com/og.png')
        expect(result.data.imageUrl).not.toBe('https://example.com/favicon.ico')
      }
    })

  })

  // ─── Group 2 — AgentResult shape ─────────────────────────────────────────

  describe('Group 2 — AgentResult shape', () => {

    it('should return success: true, source: "primary", and a numeric durationMs when ogImage is used', () => {
      // Arrange
      const scraperResult = makeScraperResult({ ogImage: 'https://example.com/og.png' })
      // Act
      const result = findImage(scraperResult, 'https://example.com/')
      // Assert
      expect(result).toMatchObject({
        success:    true,
        source:     'primary',
        durationMs: expect.any(Number),
      })
      expect(result.durationMs).toBeGreaterThanOrEqual(0)
    })

    it('should return success: true, source: "primary", and a numeric durationMs even when both images are empty', () => {
      // Arrange
      const scraperResult = makeScraperResult({ ogImage: '', favicon: '' })
      // Act
      const result = findImage(scraperResult, 'https://example.com/')
      // Assert
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
      const scraperResult = makeScraperResult({ ogImage: 'https://example.com/og.png' })
      // Act: no await — result must be available synchronously
      const result = findImage(scraperResult, 'https://example.com/')
      // Assert: Promises have a .then property; plain objects do not
      expect(result).not.toHaveProperty('then')
      expect(result.success).toBe(true)
    })

  })

  // ─── Group 4 — Full ScraperResult input ──────────────────────────────────

  describe('Group 4 — full ScraperResult input', () => {

    it('should select ogImage from a fully populated ScraperResult — title, text, and url do not affect the output', () => {
      // Arrange: all five ScraperResult fields populated
      const scraperResult: ScraperResult = {
        title:   'Full Page Title',
        text:    'Full page body text with lots of content about technology.',
        ogImage: 'https://example.com/full-og.png',
        favicon: 'https://example.com/full-favicon.ico',
        url:     'https://example.com/full-article',
      }
      // Act
      const result = findImage(scraperResult, 'https://example.com/full-article')
      // Assert: title, text, and url are irrelevant — only ogImage determines imageUrl
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.imageUrl).toBe('https://example.com/full-og.png')
      }
    })

  })

})
