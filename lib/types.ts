/**
 * AgentResult<T> — the standard return type for every product agent.
 *
 * Discriminated union enforces correct field usage at compile time:
 *   success: true  → data is guaranteed present, error is blocked by TypeScript
 *   success: false → error is guaranteed present, data is blocked by TypeScript
 *
 * source and durationMs are required on every return path — no exceptions.
 * The orchestrator always checks success before accessing data.
 */
export type AgentResult<T> =
  | {
      success: true
      data: T
      source: 'primary' | 'fallback'
      durationMs: number
      error?: never
    }
  | {
      success: false
      error: string
      source: 'primary' | 'fallback'
      durationMs: number
      data?: never
    }

// ─── Concrete result types — one per Layer 1 product agent ───────────────

/** Returned by Scraper Agent (agents/scraperAgent.ts). */
export interface ScraperResult {
  title: string
  text: string
  ogImage: string
  favicon: string
  url: string
}

/** Returned by Summary Agent (agents/summaryAgent.ts). */
export interface SummaryResult {
  summary: string
}

/** Returned by Tag Agent (agents/tagAgent.ts). */
export interface TagResult {
  tags: string[]
}

/** Returned by Image Agent (agents/imageAgent.ts). */
export interface ImageResult {
  imageUrl: string
}
