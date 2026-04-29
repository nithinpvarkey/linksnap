import type { AgentResult, ImageResult, ScraperResult } from '@/lib/types'
import { extractDomain } from '@/lib/security'

// ─── Constants ────────────────────────────────────────────────────────────────

const AGENT_NAME = 'ImageAgent'

// ─── Exported function ────────────────────────────────────────────────────────

/**
 * Selects the best thumbnail image from data already collected by Scraper Agent.
 * Tries og:image first, favicon second, falls back to empty string.
 * Synchronous — no network calls, no AI. Always returns success.
 * An empty imageUrl is a valid result — frontend renders a styled placeholder.
 */
export function findImage(
  scraperResult: ScraperResult,
  url: string,
): AgentResult<ImageResult> {
  const start  = Date.now()
  const domain = extractDomain(url)

  const imageUrl =
    scraperResult.ogImage.length > 0 ? scraperResult.ogImage :
    scraperResult.favicon.length > 0 ? scraperResult.favicon :
    ''

  const sourceUsed =
    scraperResult.ogImage.length > 0 ? 'ogImage' :
    scraperResult.favicon.length > 0 ? 'favicon' :
    'empty'

  const durationMs = Date.now() - start

  if (process.env['NODE_ENV'] !== 'production') {
    console.log({
      timestamp:  new Date().toISOString(),
      agent:      AGENT_NAME,
      domain,
      sourceUsed,
      durationMs,
      status:     'success',
    })
  }

  return {
    success:   true,
    data:      { imageUrl },
    source:    'primary',
    durationMs,
  }
}
