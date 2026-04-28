# Tech Stack and Performance

═══════════════════════════════════════════════════════════════
## TECH STACK
═══════════════════════════════════════════════════════════════

Never change any part of this stack without explicit owner approval.
Never install a package not on the approved list without asking first.

MAIN APPLICATION — runs on Vercel:
  Framework:      Next.js 14 with App Router
  Language:       TypeScript in strict mode — no exceptions ever
  Styling:        Tailwind CSS only — no other CSS frameworks ever
  Runtime:        Node.js v25.5.0

AI PROVIDERS — in priority order:
  Primary:        Google Gemini 2.5 Flash — GEMINI_API_KEY
  Gateway:        OpenRouter — OPENROUTER_API_KEY
                  Gives access to Qwen, DeepSeek, Kimi, and GLM-5
  Fallback 1:     Moonshot AI Kimi via OpenRouter
  Fallback 2:     DeepSeek V3 via OpenRouter
  Fallback 3:     GLM-5 Zhipu via OpenRouter

SCRAPING:
  Fetching:       node-fetch
  Parsing:        cheerio

SNAPGIF MICROSERVICE — runs on Docker deployed to Railway:
  Server:         Express.js
  Screenshot:     Puppeteer with headless Chrome
  GIF encoding:   gifencoder
  Watermark:      node-canvas

SERVICES:
  Payments:       Dodo Payments — never Stripe — owner is Indian founder
  Auth:           Clerk — integrates after MVP launch
  Database:       Supabase — integrates after MVP launch
  Main deploy:    Vercel free tier
  GIF deploy:     Railway free tier for Docker container
  Monitoring:     Vercel Analytics and logs

APPROVED PACKAGES:
  @google/generative-ai, node-fetch, cheerio,
  express, puppeteer, gifencoder, node-canvas

═══════════════════════════════════════════════════════════════
## PERFORMANCE MINDSET
═══════════════════════════════════════════════════════════════

We do not set hard timing promises for AI responses.
LLM latency, scraping delays, cold starts, and fallback switching
are outside our control. Promising fixed times will always fail.

WHAT WE CONTROL — make these fast and reliable:
  - Skeleton card visible the instant user clicks — pure CSS, always instant
  - Image sent to browser the moment Scraper Agent finishes — streamed immediately
  - Tags sent to browser the moment Tag Agent finishes — streamed immediately
  - Summary streams word by word as Gemini generates — never wait for full response
  - Cached URLs return full card in milliseconds — no AI call needed

WHAT WE DO NOT CONTROL — handle gracefully:
  - LLM response time — typically 1 to 5 seconds depending on model and load
  - Scraping time — typically 0.5 to 5 seconds depending on target website
  - Cold starts on Vercel — first request after idle can add 1 to 2 seconds
  - Fallback switching — adds up to 3 seconds if primary model fails

THE CORRECT MINDSET:
  - User must see something happening within 100 milliseconds — always
  - User must never see a blank screen or frozen UI — ever
  - User feels progress the whole time — skeleton then image then tags then summary
  - Perceived speed matters more than actual speed
  - Stream everything — never batch and wait
  - This is how ChatGPT, Perplexity, and Claude handle AI latency

TECHNIQUES THAT ACHIEVE THIS:
  - All Layer 1 agents fire simultaneously — results arrive independently
  - Server-Sent Events stream each result the moment it is ready
  - Vercel KV cache stores processed results for 24 hours
  - Each agent has a 3-second timeout then switches to fallback automatically
  - Vercel edge network serves from nearest global location automatically
  - URL pre-validation starts 800 milliseconds after user stops typing

VALID HARD TARGETS — these we can and must control:
  - Lighthouse score above 90 on all four metrics
  - Core Web Vitals all green
  - Initial JavaScript bundle under 200 kilobytes
  - Skeleton card visible in under 100 milliseconds
