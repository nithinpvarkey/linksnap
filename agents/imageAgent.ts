import type { AgentResult, ImageResult, ScraperResult } from '@/lib/types'
import { extractDomain } from '@/lib/security'

// ─── Constants ────────────────────────────────────────────────────────────────

const AGENT_NAME   = 'ImageAgent'
const STYLE_SUFFIX = '. Digital art, vibrant colors, modern illustration, no text.'

// ─── Private helpers ─────────────────────────────────────────────────────────

function urlToSeed(url: string): number {
  let hash = 0
  for (let i = 0; i < url.length; i++) {
    hash = ((hash << 5) - hash) + url.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

function buildPrompt(subject: string): string {
  const maxSubject = 200 - STYLE_SUFFIX.length
  return subject.slice(0, maxSubject).trimEnd() + STYLE_SUFFIX
}

function buildPollinationsUrl(prompt: string, seed: number): string {
  return (
    `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}` +
    `?width=1200&height=630&nologo=true&seed=${seed}`
  )
}

// ─── Exported function ────────────────────────────────────────────────────────

/**
 * Builds a Pollinations.ai image URL from the page summary.
 * Synchronous — constructs a URL string, no network call required.
 * The browser fetches the image directly; Pollinations generates it on demand.
 * Falls back to domain name as prompt if summary is empty.
 * Always returns success — a valid Pollinations URL is always constructible.
 */
export function findImage(
  scraperResult: ScraperResult,
  url:           string,
  summary:       string,
): AgentResult<ImageResult> {
  const start  = Date.now()
  const domain = extractDomain(url)
  const seed   = urlToSeed(url)

  const subject = summary.trim().length > 0
    ? summary
    : `${domain} website`

  const prompt   = buildPrompt(subject)
  const imageUrl = buildPollinationsUrl(prompt, seed)

  const durationMs = Date.now() - start

  if (process.env['NODE_ENV'] !== 'production') {
    console.log({
      timestamp:  new Date().toISOString(),
      agent:      AGENT_NAME,
      domain,
      sourceUsed: 'pollinations',
      seed,
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
