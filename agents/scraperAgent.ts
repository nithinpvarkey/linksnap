import { load, type CheerioAPI } from 'cheerio'
import type { AgentResult, ScraperResult } from '@/lib/types'
import { validateUrl, validateRedirect, extractDomain } from '@/lib/security'

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_DOWNLOAD_BYTES = 1_048_576  // 1MB
const MAX_TEXT_CHARS     = 50_000     // ~50KB — safe for English text
const FETCH_TIMEOUT_MS   = 5_000     // 5 seconds
const AGENT_NAME         = 'ScraperAgent'

// ─── Private helpers ─────────────────────────────────────────────────────────

function buildFailure(error: string, durationMs: number): AgentResult<ScraperResult> {
  return { success: false, error, source: 'primary', durationMs }
}

function extractFavicon($: CheerioAPI, baseUrl: string): string {
  const href =
    $('link[rel~="icon"]').attr('href') ??
    $('link[rel~="apple-touch-icon"]').attr('href')

  try {
    if (href) return new URL(href, baseUrl).toString()
    return new URL('/favicon.ico', baseUrl).toString()
  } catch {
    return ''
  }
}

function extractText($: CheerioAPI): string {
  return $('body')
    .text()
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TEXT_CHARS)
}

async function fetchWithRedirects(
  url: string,
  signal: AbortSignal,
): Promise<{ body: string; finalUrl: string }> {
  let currentUrl = url

  for (let hopCount = 0; hopCount <= 3; hopCount++) {
    const response = await fetch(currentUrl, {
      redirect: 'manual',
      signal,
      headers: { 'User-Agent': 'LinkSnap/1.0' },
    })

    if (response.status < 300 || response.status >= 400) {
      const contentLength = response.headers.get('content-length')
      if (contentLength !== null && parseInt(contentLength, 10) > MAX_DOWNLOAD_BYTES) {
        throw new Error('Page exceeds maximum download size')
      }

      const body = await response.text()
      if (Buffer.byteLength(body, 'utf8') > MAX_DOWNLOAD_BYTES) {
        throw new Error('Page exceeds maximum download size')
      }

      return { body, finalUrl: currentUrl }
    }

    const location = response.headers.get('location')
    if (!location) throw new Error('Redirect received with no Location header')

    const resolved = new URL(location, currentUrl).toString()
    const validation = await validateRedirect(resolved, hopCount + 1)
    if (!validation.valid) throw new Error('Redirect destination failed security validation')

    currentUrl = resolved
  }

  throw new Error('Too many redirects')
}

// ─── Exported function ────────────────────────────────────────────────────────

/**
 * Fetches a URL safely, following up to 3 validated redirects, and extracts
 * the page title, cleaned body text, og:image URL, and favicon URL.
 * Every redirect hop is validated against the same security rules as the
 * original URL — preventing redirect-to-private-IP attacks (Threat 3).
 * Never throws — always returns AgentResult.
 */
export async function scrapeUrl(url: string): Promise<AgentResult<ScraperResult>> {
  const start = Date.now()

  const validation = await validateUrl(url)
  if (!validation.valid) {
    return buildFailure('This URL is not valid or cannot be accessed', Date.now() - start)
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const { body, finalUrl } = await fetchWithRedirects(url, controller.signal)

    const $ = load(body)
    $('script, style, iframe, noscript, object').remove()

    const title   = ($('meta[property="og:title"]').attr('content') ?? $('title').text()).trim()
    const ogImage = $('meta[property="og:image"]').attr('content') ?? ''
    const favicon = extractFavicon($, finalUrl)
    const text    = extractText($)

    const durationMs = Date.now() - start

    if (process.env['NODE_ENV'] !== 'production') {
      console.log({
        timestamp: new Date().toISOString(),
        agent:     AGENT_NAME,
        domain:    extractDomain(url),
        durationMs,
        status:    'success',
      })
    }

    return {
      success: true,
      data:    { title, text, ogImage, favicon, url: finalUrl },
      source:  'primary',
      durationMs,
    }
  } catch (err) {
    const durationMs = Date.now() - start
    console.error({
      timestamp: new Date().toISOString(),
      agent:     AGENT_NAME,
      domain:    extractDomain(url),
      durationMs,
      error:     err instanceof Error ? err.message : 'Unknown error',
    })
    return buildFailure('Failed to fetch or read this page', durationMs)
  } finally {
    clearTimeout(timeout)
  }
}
