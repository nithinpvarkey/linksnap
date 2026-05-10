import type { AgentResult, ImageResult, ScraperResult } from '@/lib/types'

// ─── Exported function ────────────────────────────────────────────────────────

/**
 * Returns the og:image URL already collected by the scraper.
 * Free, fast, and always relevant — no external API call needed.
 * Returns imageUrl: '' if the page had no og:image, triggering
 * the domain-initial placeholder in the UI.
 */
export async function findImage(
  scraperResult: ScraperResult,
  _url:          string,
  _summary:      string,
  _title:        string,
): Promise<AgentResult<ImageResult>> {
  const start    = Date.now()
  const imageUrl = scraperResult.ogImage.trim()

  return {
    success:    true,
    data:       { imageUrl },
    source:     'primary',
    durationMs: Date.now() - start,
  }
}
