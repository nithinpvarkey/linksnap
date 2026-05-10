import type { AgentResult, ScraperResult, SummaryResult, TagResult, ImageResult } from '@/lib/types'
import type { SseStream } from '@/lib/streaming'
import { getCached, setCached, type CachedCard } from '@/lib/cache'
import { scrapeUrl }      from '@/agents/scraperAgent'
import { summarisePage }  from '@/agents/summaryAgent'
import { generateTags }   from '@/agents/tagAgent'
import { findImage }      from '@/agents/imageAgent'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OrchestratorResult {
  title:            string
  summary:          string
  tags:             string[]
  imageUrl:         string
  fromCache:        boolean
  agentsDurationMs: number
}

// ─── Exported function ────────────────────────────────────────────────────────

/**
 * Runs all 4 product agents and streams results to the browser as each resolves.
 * Checks Vercel KV cache first — cache hits stream instantly without calling any agent.
 * Scraper failure is the only case that stops everything — all other agent failures
 * return partial results. All 3 agents run in parallel — image reads og:image from
 * the scraper result so it has no dependency on summary.
 * Manages the complete stream lifecycle. Never throws — always returns OrchestratorResult.
 */
export async function orchestrate(
  url:    string,
  isPro:  boolean,
  stream: SseStream,
  cardId: string,
): Promise<OrchestratorResult> {
  const agentsStart = Date.now()

  // ── Section A: Cache check ──────────────────────────────────────────────────

  const cached = await getCached(url)

  if (cached !== null) {
    await stream.sendEvent('image',   { imageUrl: cached.imageUrl })
    await stream.sendEvent('title',   { title:    cached.title    })
    for (const tag of cached.tags) {
      await stream.sendEvent('tag', { tag })
    }
    await stream.sendEvent('summary', { token: cached.summary })
    stream.close(cardId)
    return {
      title:            cached.title,
      summary:          cached.summary,
      tags:             cached.tags,
      imageUrl:         cached.imageUrl,
      fromCache:        true,
      agentsDurationMs: Date.now() - agentsStart,
    }
  }

  // ── Section B: Run scraper ──────────────────────────────────────────────────

  const scraperResult = await scrapeUrl(url)

  if (!scraperResult.success) {
    await stream.sendEvent('error', { section: 'scraper', message: scraperResult.error })
    stream.close(cardId)
    return {
      title:            '',
      summary:          '',
      tags:             [],
      imageUrl:         '',
      fromCache:        false,
      agentsDurationMs: Date.now() - agentsStart,
    }
  }

  // Store scraperResult.data in an explicit variable so TypeScript narrowing
  // is preserved inside the arrow function closures defined below
  const scraperData: ScraperResult = scraperResult.data
  const { title, text }            = scraperData
  const finalUrl                   = scraperData.url

  // ── Section C: Send title immediately ──────────────────────────────────────

  await stream.sendEvent('title', { title })

  // ── Section D: All 3 agents run in parallel ─────────────────────────────────
  // Image reads og:image from scraperData — no dependency on summary.

  const runSummary = async (): Promise<AgentResult<SummaryResult>> => {
    const result = await summarisePage(text, title, finalUrl)
    if (result.success) {
      await stream.sendEvent('summary', { token: result.data.summary })
    } else {
      await stream.sendEvent('error', { section: 'summary', message: 'Summary unavailable for this page' })
    }
    return result
  }

  const runTags = async (): Promise<AgentResult<TagResult>> => {
    const result = await generateTags(text, finalUrl, isPro, title)
    if (result.success) {
      for (const tag of result.data.tags) {
        await stream.sendEvent('tag', { tag })
      }
    } else {
      await stream.sendEvent('error', { section: 'tags', message: 'Tags unavailable for this page' })
    }
    return result
  }

  const runImage = async (): Promise<AgentResult<ImageResult>> => {
    const result   = await findImage(scraperData, finalUrl, '', title)
    const imageUrl = result.success ? result.data.imageUrl : ''
    await stream.sendEvent('image', { imageUrl })
    return result
  }

  // All 3 fire simultaneously — each streams its result the moment it resolves.
  const settled = await Promise.allSettled([runSummary(), runTags(), runImage()])

  // ── Section E: Assemble result and close stream ─────────────────────────────

  const summarySettled = settled[0] as PromiseSettledResult<AgentResult<SummaryResult>>
  const tagsSettled    = settled[1] as PromiseSettledResult<AgentResult<TagResult>>
  const imageSettled   = settled[2] as PromiseSettledResult<AgentResult<ImageResult>>

  const summary  = summarySettled.status === 'fulfilled' && summarySettled.value.success
    ? summarySettled.value.data.summary : ''
  const tags     = tagsSettled.status === 'fulfilled' && tagsSettled.value.success
    ? tagsSettled.value.data.tags       : []
  const imageUrl = imageSettled.status === 'fulfilled' && imageSettled.value.success
    ? imageSettled.value.data.imageUrl  : ''

  stream.close(cardId)

  // ── Section F: Cache and return ─────────────────────────────────────────────

  const card: CachedCard = {
    title,
    summary,
    tags,
    imageUrl,
    cachedAt: Date.now(),
  }

  void setCached(url, card)

  return {
    title,
    summary,
    tags,
    imageUrl,
    fromCache:        false,
    agentsDurationMs: Date.now() - agentsStart,
  }
}
