import { validateUrl, extractDomain } from '@/lib/security'
import { checkRateLimit, incrementConcurrency,
         decrementConcurrency, getClientIp }  from '@/lib/rateLimit'
import { checkFreeTier }                      from '@/lib/freeTier'
import { createSseStream, createHeartbeat, SSE_HEADERS } from '@/lib/streaming'
import { orchestrate, type OrchestratorResult } from '@/agents/orchestrator'

// ─── Constants ────────────────────────────────────────────────────────────────

const ROUTE_NAME = 'POST /api/summarise'

// ─── Private helpers ─────────────────────────────────────────────────────────

function hasUrlField(value: unknown): value is { url: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'url' in value &&
    typeof (value as { url: unknown }).url === 'string'
  )
}

// ─── Route handler ────────────────────────────────────────────────────────────

/**
 * Accepts a URL, runs all security and limit checks, then streams the
 * assembled card back to the browser via Server-Sent Events.
 * Execution order: parse → validate URL → rate limit → concurrency →
 * free tier → orchestrate → stream response.
 */
export async function POST(request: Request): Promise<Response> {

  // A — Extract IP (x-forwarded-for → x-real-ip → "unknown")
  const ip = getClientIp(request)

  // B — Parse and validate request body
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (!hasUrlField(body)) {
    return Response.json(
      { error: 'url is required and must be a string' },
      { status: 400 },
    )
  }

  const { url } = body

  // C — Validate URL through all 7 security steps
  const urlValidation = await validateUrl(url)
  if (!urlValidation.valid) {
    return Response.json(
      { error: 'This URL is not valid or cannot be accessed' },
      { status: 400 },
    )
  }

  // D — Rate limit: 10 requests per 60-second window per IP
  const rateLimitResult = checkRateLimit(ip)
  if (!rateLimitResult.allowed) {
    console.error({
      timestamp:  new Date().toISOString(),
      route:      ROUTE_NAME,
      domain:     extractDomain(url),
      event:      'rate_limit',
      retryAfter: rateLimitResult.retryAfter,
    })
    return new Response(
      JSON.stringify({ error: 'Too many requests' }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After':  String(rateLimitResult.retryAfter),
        },
      },
    )
  }

  // E — Concurrency: max 3 simultaneous requests per IP
  // incrementConcurrency only increments on allowed:true — no decrement needed on false
  const concurrencyResult = incrementConcurrency(ip)
  if (!concurrencyResult.allowed) {
    return new Response(
      JSON.stringify({ error: 'Too many concurrent requests' }),
      { status: 429, headers: { 'Content-Type': 'application/json' } },
    )
  }

  // F — Free tier: 3 summaries per day per IP
  // Concurrency was incremented above — must decrement before any early return from here on
  const freeTierResult = checkFreeTier(ip)
  if (!freeTierResult.allowed) {
    decrementConcurrency(ip)
    console.error({
      timestamp: new Date().toISOString(),
      route:     ROUTE_NAME,
      domain:    extractDomain(url),
      event:     'free_tier_limit',
    })
    return Response.json(
      {
        error:     'free_tier_limit',
        remaining: 0,
        message:   'Upgrade to Pro for unlimited summaries',
      },
      { status: 402 },
    )
  }

  // G — Pro status (MVP: always false)
  // TODO Phase 5: replace with Clerk session check
  const isPro = false

  // H — Create SSE stream and heartbeat
  const sseStream     = createSseStream()
  const stopHeartbeat = createHeartbeat(sseStream)

  // I — Fire orchestrate in background, return SSE response immediately.
  // The IIFE contains try-catch-finally so cleanup always runs even if
  // orchestrate throws or the error-event send itself fails.
  void (async (): Promise<void> => {
    try {
      const result: OrchestratorResult = await orchestrate(url, isPro, sseStream)

      if (process.env['NODE_ENV'] !== 'production') {
        console.log({
          timestamp:  new Date().toISOString(),
          route:      ROUTE_NAME,
          domain:     extractDomain(url),
          isPro,
          fromCache:  result.fromCache,
          durationMs: result.agentsDurationMs,
        })
      }

    } catch (err) {
      console.error({
        timestamp: new Date().toISOString(),
        route:     ROUTE_NAME,
        domain:    extractDomain(url),
        error:     err instanceof Error ? err.message : 'Unknown error',
      })
      try {
        await sseStream.sendEvent('error', {
          section: 'server',
          message: 'An unexpected error occurred',
        })
        sseStream.close()
      } catch {
        // Stream may already be closed by orchestrate — ignore
      }

    } finally {
      stopHeartbeat()
      decrementConcurrency(ip)
    }
  })()

  return new Response(sseStream.readable, { headers: SSE_HEADERS })
}
