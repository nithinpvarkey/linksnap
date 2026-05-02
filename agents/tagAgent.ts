import { GoogleGenerativeAI } from '@google/generative-ai'
import type { AgentResult, TagResult } from '@/lib/types'
import { sanitiseAiOutput, extractDomain } from '@/lib/security'

// ─── Constants ────────────────────────────────────────────────────────────────

const INPUT_CHAR_LIMIT = 2_000   // tags need less context than summaries
const MAX_TAG_CHARS    = 50      // per tag — filter and sanitise limit
const CALL_TIMEOUT_MS  = 10_000  // per attempt
const AGENT_NAME       = 'TagAgent'

// ─── Private helpers ─────────────────────────────────────────────────────────

class TimeoutError extends Error {
  constructor() {
    super('Request timed out')
    this.name = 'TimeoutError'
  }
}

function buildFailure(error: string, durationMs: number): AgentResult<TagResult> {
  return { success: false, error, source: 'primary', durationMs }
}

function buildSystemPrompt(tagCount: number): string {
  return (
    `You are a content classifier. Generate exactly ${tagCount} short tags for this web page. ` +
    'Return only a JSON array of strings. Example: ["tag1","tag2","tag3"] ' +
    'Tags must be 1-3 words each. No explanations.'
  )
}

function buildUserMessage(text: string): string {
  return `Page content:\n\n${text}`
}

function tryWithTimeout<T>(promise: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = setTimeout(() => reject(new TimeoutError()), CALL_TIMEOUT_MS)
    promise.then(
      result => { clearTimeout(id); resolve(result) },
      err    => { clearTimeout(id); reject(err as Error) },
    )
  })
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string')
}

function parseTags(raw: string, tagCount: number): string[] | null {
  // Strip markdown code fences — LLMs frequently wrap JSON in these
  const cleaned = raw.replace(/```json\n?/g, '').replace(/```/g, '').trim()

  let parsed: unknown
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    return null
  }

  if (!isStringArray(parsed)) return null

  const tags = parsed
    .filter(tag => tag.length <= MAX_TAG_CHARS)         // remove oversized tags
    .map(tag    => sanitiseAiOutput(tag, MAX_TAG_CHARS)) // strip HTML from each
    .filter(tag => tag.length > 0)                      // remove anything emptied
    .slice(0, tagCount)                                 // never return more than asked

  return tags.length > 0 ? tags : null
}

interface OpenRouterChoice {
  message: { content: string }
}

interface OpenRouterResponse {
  choices: OpenRouterChoice[]
}

function isOpenRouterResponse(data: unknown): data is OpenRouterResponse {
  return (
    typeof data === 'object' &&
    data !== null &&
    'choices' in data &&
    Array.isArray((data as { choices: unknown }).choices)
  )
}

async function callOpenRouter(
  model: string,
  text: string,
  systemPrompt: string,
): Promise<string> {
  const apiKey = process.env['OPENROUTER_API_KEY']
  if (!apiKey) throw new Error('MISSING_KEY')

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type':  'application/json',
      'HTTP-Referer':  'https://linksnapr.app',
      'X-Title':       'LinkSnapr',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: buildUserMessage(text) },
      ],
      max_tokens: 100,
    }),
  })

  if (response.status === 429) throw new Error('RATE_LIMIT')
  if (response.status >= 500) throw new Error('API_ERROR')
  if (!response.ok)           throw new Error(`HTTP_ERROR_${response.status}`)

  const data: unknown = await response.json()
  if (!isOpenRouterResponse(data)) throw new Error('INVALID_RESPONSE')

  const first = data.choices[0]
  if (!first) throw new Error('INVALID_RESPONSE')

  const { content } = first.message
  if (!content) throw new Error('EMPTY_RESPONSE')
  return content
}

async function callGemini(text: string, systemPrompt: string): Promise<string> {
  const apiKey = process.env['GEMINI_API_KEY']
  if (!apiKey) throw new Error('MISSING_KEY')

  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({
    model:             'gemini-2.5-flash-preview-04-17',
    systemInstruction: systemPrompt,
    generationConfig:  { maxOutputTokens: 100 },
  })

  const result = await model.generateContent(buildUserMessage(text))
  const output = result.response.text()
  if (!output) throw new Error('EMPTY_RESPONSE')
  return output
}

async function tryModel(
  label: string,
  call: () => Promise<string>,
  domain: string,
): Promise<string | null> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      return await tryWithTimeout(call())
    } catch (err) {
      if (err instanceof TimeoutError) {
        if (attempt === 1) {
          console.error({
            timestamp: new Date().toISOString(),
            agent:     AGENT_NAME,
            domain,
            model:     label,
            message:   'Timeout — retrying once',
          })
          continue
        }
        console.error({
          timestamp: new Date().toISOString(),
          agent:     AGENT_NAME,
          domain,
          model:     label,
          message:   'Retry also timed out — skipping model',
        })
        return null
      }
      // Rate limit, API error, missing key, parse fail — skip immediately
      console.error({
        timestamp: new Date().toISOString(),
        agent:     AGENT_NAME,
        domain,
        model:     label,
        error:     err instanceof Error ? err.message : 'Unknown error',
      })
      return null
    }
  }
  return null
}

// ─── Exported function ────────────────────────────────────────────────────────

/**
 * Generates 3 tags (free tier) or 5 tags (Pro) using Qwen as primary,
 * falling back through Gemini, DeepSeek, and GLM-5 if any model fails.
 * AI output is parsed as a JSON array — each tag is individually sanitised.
 * Never throws — always returns AgentResult.
 */
export async function generateTags(
  text: string,
  url: string,
  isPro: boolean,
): Promise<AgentResult<TagResult>> {
  const start        = Date.now()
  const domain       = extractDomain(url)
  const tagCount     = isPro ? 5 : 3
  const truncated    = text.slice(0, INPUT_CHAR_LIMIT)
  const systemPrompt = buildSystemPrompt(tagCount)

  const models = [
    {
      label:  'qwen3-235b-a22b',
      source: 'primary'  as const,
      call:   () => callOpenRouter('qwen/qwen3-235b-a22b', truncated, systemPrompt),
    },
    {
      label:  'gemini-2.5-flash',
      source: 'fallback' as const,
      call:   () => callGemini(truncated, systemPrompt),
    },
    {
      label:  'deepseek/deepseek-chat',
      source: 'fallback' as const,
      call:   () => callOpenRouter('deepseek/deepseek-chat', truncated, systemPrompt),
    },
    {
      label:  'zhipu/glm-4-flash',
      source: 'fallback' as const,
      call:   () => callOpenRouter('zhipu/glm-4-flash', truncated, systemPrompt),
    },
  ]

  for (const model of models) {
    const result = await tryModel(model.label, model.call, domain)

    if (result === null) {
      console.error({
        timestamp: new Date().toISOString(),
        agent:     AGENT_NAME,
        domain,
        message:   `${model.label} failed — trying next model`,
      })
      continue
    }

    const tags = parseTags(result, tagCount)

    if (tags === null) {
      console.error({
        timestamp: new Date().toISOString(),
        agent:     AGENT_NAME,
        domain,
        model:     model.label,
        message:   'Tag parsing failed — trying next model',
      })
      continue
    }

    const durationMs = Date.now() - start

    if (process.env['NODE_ENV'] !== 'production') {
      console.log({
        timestamp: new Date().toISOString(),
        agent:     AGENT_NAME,
        domain,
        model:     model.label,
        tagCount:  tags.length,
        durationMs,
        status:    'success',
      })
    }

    return {
      success: true,
      data:    { tags },
      source:  model.source,
      durationMs,
    }
  }

  return buildFailure('Tags unavailable for this page', Date.now() - start)
}
