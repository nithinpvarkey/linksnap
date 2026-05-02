# TASKS.md — LinkSnapr Build Progress

This file is the single source of truth for what is happening right now.
Read this at the start of every session before doing anything.
Update this at the end of every session before closing.
Never put architecture decisions here — those live in CLAUDE.md.
Never put lessons learned here — those live in LESSONS.md.

Last updated:  April 2026
Current phase: 2 — Core product agents
Overall status: Phase 1 complete. Next.js running. Ready to build.

═══════════════════════════════════════════════════════════════
## CURRENT SESSION FOCUS
═══════════════════════════════════════════════════════════════

Read this section first. This is what we are doing right now.

  Working on:   Phase 3 — Frontend
  Next action:  Testing Agent review of Phase 2 files
                then begin UI components
  Blocked by:   Nothing — Phase 2 fully complete and committed
  Owner note:   Phase 2 complete — all 12 files built, reviewed, committed.
                Testing Agent must sign off before any Phase 3 UI work begins.

═══════════════════════════════════════════════════════════════
## PROJECT STATUS OVERVIEW
═══════════════════════════════════════════════════════════════

  Phase 0 — Dev team setup          Complete     ████████ 100%
  Phase 1 — Project initialisation  Complete     ████████ 100%
  Phase 2 — Core product agents     Complete     ████████ 100%
  Phase 3 — Frontend                In progress  ░░░░░░░░   0%
  Phase 4 — SnapGIF microservice    Not started  ░░░░░░░░   0%
  Phase 5 — Pro tier                Not started  ░░░░░░░░   0%
  Phase 6 — Deploy and launch       Not started  ░░░░░░░░   0%

═══════════════════════════════════════════════════════════════
## ENVIRONMENT AND ACCOUNTS
═══════════════════════════════════════════════════════════════

This section tracks everything needed before code can run.
Update status column as each item is confirmed.

  RUNTIME:
  [x] Node.js installed          v25.5.0
  [x] npm installed              v11.8.0
  [x] Git installed              v2.50.1

  API KEYS — stored in .env.local only — never committed:
  [x] GEMINI_API_KEY             obtained — Google AI Studio
  [x] OPENROUTER_API_KEY         obtained — existing key confirmed
  [ ] SNAPGIF_SECRET             generate when building Phase 4
  [ ] SNAPGIF_SERVICE_URL        get after Railway deploy in Phase 6

  ACCOUNTS:
  [x] Vercel                     connected — deployment ready
  [x] Supabase                   account ready — not integrated yet
  [x] Clerk                      account ready — not integrated yet
  [x] Dodo Payments              KYC verified — not integrated yet
  [x] OpenRouter                 account ready — key obtained
  [ ] Railway                    needed for Phase 4 SnapGIF Docker service

  LOCAL SETUP:
  [x] linksnapr/ folder           verified — pushed to github.com/nithinpvarkey/linksnapr
  [x] .env.local                 real API keys added and confirmed loading
  [x] .env.local.example         created with placeholder values only
  [x] .gitignore                 created — .env.local excluded confirmed
  [x] Next.js initialised        done — npm run dev running at localhost:3000

  MCP SERVERS:
  [x] Context7 MCP               installed — live documentation for all packages
  [ ] Playwright MCP             install at Phase 3
  [ ] Supabase MCP               install at Phase 5
  [ ] GitHub MCP                 install at Phase 5
  [ ] Vercel MCP                 install at Phase 6

  SKILLS:
  [ ] frontend-design skill      install after all agents are written
  [ ] code-review skill          install at Phase 3
  [ ] typescript-strict skill    install at Phase 3
  [ ] test-generation skill      install at Phase 3

═══════════════════════════════════════════════════════════════
## PHASE 0 — DEV TEAM SETUP
═══════════════════════════════════════════════════════════════

Goal: All dev team agent instruction files written and ready.
      No product code yet. Just the team briefed and in position.

  [x] CLAUDE.md                          complete — approved by owner
  [x] tasks/TASKS.md                     complete — this file
  [x] tasks/LESSONS.md                   complete — header only
  [x] .claude/agents/ folder             created
  [x] .claude/rules/security.md          complete
  [x] .claude/rules/design.md            complete
  [x] .claude/rules/stack.md             complete
  [x] .claude/rules/agents.md            complete
  [x] .claude/agents/backend.md          complete
  [x] .claude/agents/security.md         complete
  [x] .claude/agents/frontend.md         complete
  [x] .claude/agents/testing.md          complete
  [x] .claude/agents/performance.md      complete
  [x] .claude/agents/review.md           complete
  [x] .claude/agents/deployment.md       complete
  [x] .claude/agents/monitor.md          complete
  [x] .claude/agents/analytics.md        complete
  [x] .claude/agents/docs.md             complete

  Phase 0 complete when: all 10 AGENT.md files written and reviewed.

═══════════════════════════════════════════════════════════════
## PHASE 1 — PROJECT INITIALISATION
═══════════════════════════════════════════════════════════════

Goal: Clean Next.js project running locally with correct config.
      No features yet — just the scaffold done right.

  SETUP:
  [x] Verify linksnapr/ folder contents — was empty except planning files
  [x] Initialise Next.js 14 with TypeScript and Tailwind — manual setup
  [x] Configure tsconfig.json strict mode — strict + noImplicitAny + noUncheckedIndexedAccess
  [x] Configure next.config.js security headers — all 5 headers including CSP
  [x] Create .gitignore — .env.local and .env*.local excluded
  [ ] Create .env.local with real API keys — placeholders created, owner adds keys
  [x] Create .env.local.example with placeholder values only
  [x] Create all folders from structure in CLAUDE.md
  [x] Verify project runs locally — npm run dev ready in 1433ms
  [x] Product renamed from LinkSnap to LinkSnapr
      Verified clean — zero TypeScript errors,
      zero stale references, build passing

  AGENT SIGN-OFF REQUIRED:
  [x] Security Agent — next.config.mjs headers and .gitignore — APPROVED
  [x] Code Review Agent — tsconfig.json and project structure — APPROVED

  ADVISORY — not blocking Phase 2:
  [ ] npm audit: 5 vulnerabilities in Next.js 14 and eslint-config-next
      Fix requires upgrading to Next.js 16+ — breaks our approved stack
      All are either dev-only (eslint/glob) or mitigated by our config
      Owner decision needed: stay on Next.js 14 or approve upgrade to 15/16

  Phase 1 complete when: npm run dev shows Next.js welcome page locally.

═══════════════════════════════════════════════════════════════
## PHASE 2 — CORE PRODUCT AGENTS
═══════════════════════════════════════════════════════════════

Goal: All 4 Layer 1 agents working. URL paste returns a card.
      Free tier limit enforced. Rate limiting active.

  LIBRARY FILES — build these first, agents depend on them:
  [x] lib/security.ts            URL validation and signed token generation
  [x] lib/rateLimit.ts           10 requests per minute per IP
  [x] lib/freeTier.ts            3 per day localStorage tracking logic
  [x] lib/cache.ts               Vercel KV cache — check before AI calls
  [x] lib/streaming.ts           Server-Sent Events helpers

  PRODUCT AGENTS:
  [x] agents/scraperAgent.ts     fetch HTML, extract title, text, og:image
  [x] agents/summaryAgent.ts     Gemini summary with Kimi and DeepSeek fallbacks
  [x] agents/tagAgent.ts         Qwen tags with Gemini and DeepSeek fallbacks
  [x] agents/imageAgent.ts       og:image chain — no AI needed
  [x] agents/orchestrator.ts     run all 4 agents in parallel, stream results

  API ROUTE:
  [x] app/api/summarise/route.ts security check, rate limit, orchestrate, stream

  AGENT SIGN-OFF REQUIRED:
  [x] Backend Agent — builds all files above
  [x] Security Agent — reviews every file before proceeding
  [ ] Testing Agent — tests all agents including failure scenarios and fallbacks
  [ ] Performance Agent — verifies streaming and parallel execution
  [x] Code Review Agent — reviews TypeScript types and error handling

  Phase 2 complete when: pasting a URL returns title, image, summary, tags.

═══════════════════════════════════════════════════════════════
## PHASE 3 — FRONTEND
═══════════════════════════════════════════════════════════════

Goal: Beautiful mobile-first UI. Free tier upgrade prompt working.
      Shareable card page live. Looks like people would pay for it.

  COMPONENTS:
  [ ] components/SkeletonCard.tsx       shows instantly on button click
  [ ] components/LinkCard.tsx           the main card — title, image, tags, summary
  [ ] components/UpgradePrompt.tsx      shown when 3/day limit is reached
  [ ] components/ShareButtons.tsx       copy link, WhatsApp, Twitter, Slack
  [ ] components/SnapGifButton.tsx      Pro only — blurred with lock on free tier

  PAGES:
  [ ] app/layout.tsx                    root layout, metadata, fonts
  [ ] app/page.tsx                      homepage — URL input, hero, card result
  [ ] app/s/[id]/page.tsx               public shareable card page with og tags

  AGENT SIGN-OFF REQUIRED:
  [ ] Frontend Agent — builds all components and pages
  [ ] Security Agent — reviews all user-facing input handling
  [ ] Testing Agent — tests on mobile, tablet, desktop — all screen sizes
  [ ] Performance Agent — Lighthouse score above 90, bundle under 200KB
  [ ] Code Review Agent — TypeScript props, loading states, error states

  Phase 3 complete when: full flow works on mobile — paste URL, see card, share it.

═══════════════════════════════════════════════════════════════
## PHASE 4 — SNAPGIF MICROSERVICE
═══════════════════════════════════════════════════════════════

Goal: Docker microservice running on Railway.
      Pro users can generate and download 5-second animated GIF.
      Watermark burned into pixels. Signed expiring download link.

  PREREQUISITE: Railway account must be created before this phase.

  DOCKER SERVICE:
  [ ] snapgif-service/Dockerfile               Linux, Node, Chrome, Puppeteer
  [ ] snapgif-service/.dockerignore
  [ ] snapgif-service/package.json
  [ ] snapgif-service/index.ts                 Express server, one endpoint
  [ ] snapgif-service/lib/security.ts          validate SNAPGIF_SECRET on every request

  SNAPGIF AGENTS:
  [ ] snapgif-service/agents/renderAgent.ts    open card in headless Chrome
  [ ] snapgif-service/agents/frameAgent.ts     screenshot 5 animation states
  [ ] snapgif-service/agents/watermarkAgent.ts burn logo into pixels, embed metadata
  [ ] snapgif-service/agents/gifEncoderAgent.ts stitch frames into 5-second GIF

  VERCEL SIDE:
  [ ] app/api/snapgif/route.ts                 verify Pro status, call Docker service
  [ ] components/SnapGifButton.tsx             update to call real endpoint

  ENVIRONMENT VARIABLES TO ADD:
  [ ] SNAPGIF_SECRET                           generate strong random secret
  [ ] SNAPGIF_SERVICE_URL                      Railway URL after deploy

  AGENT SIGN-OFF REQUIRED:
  [ ] Backend Agent — builds all service files
  [ ] Security Agent — reviews shared secret, signed URLs, watermark embedding
  [ ] Testing Agent — tests GIF generation, watermark, expiry, Pro gate
  [ ] Deployment Agent — Docker build, Railway deploy, smoke test
  [ ] Monitor Agent — set up health check on Railway service URL

  Phase 4 complete when: Pro user clicks SnapGIF and receives working animated GIF.

═══════════════════════════════════════════════════════════════
## PHASE 5 — PRO TIER
═══════════════════════════════════════════════════════════════

Goal: Paying users exist. Auth works. Payments work. Pro features gated.

  PREREQUISITE: Phase 2 and 3 must be complete and stable.
  PREREQUISITE: At least 10 real users using free tier first.
                Do not build payments before validating the product.

  AUTH — Clerk:
  [ ] Install and configure Clerk
  [ ] Sign up and sign in pages
  [ ] User session available in API routes
  [ ] Free tier limit tied to account not just localStorage

  PAYMENTS — Dodo Payments:
  [ ] Dodo Payments webhook endpoint
  [ ] Pro status stored in Supabase after successful payment
  [ ] Upgrade page with pricing
  [ ] Cancel and manage subscription flow

  DATABASE — Supabase:
  [ ] Users table — id, email, pro status, created at
  [ ] Cards table — id, user id, url, card data, created at
  [ ] Usage table — user id, date, summary count, gif count

  PRO FEATURE GATES:
  [ ] Unlimited summaries — remove 3/day cap for Pro users
  [ ] 5 tags instead of 3
  [ ] No watermark on cards and GIFs
  [ ] Bulk URL processing endpoint
  [ ] Export endpoints — PNG, PDF, CSV, Notion

  AGENT SIGN-OFF REQUIRED:
  [ ] Backend Agent — all new endpoints and database schema
  [ ] Security Agent — auth flow, payment webhooks, data access rules
  [ ] Frontend Agent — upgrade page, Pro UI states, account page
  [ ] Testing Agent — payment flow, Pro gate, free to Pro upgrade path
  [ ] Code Review Agent — database queries, error handling

  Phase 5 complete when: a real person pays $3 and gets Pro features.

═══════════════════════════════════════════════════════════════
## PHASE 6 — DEPLOY AND LAUNCH
═══════════════════════════════════════════════════════════════

Goal: Product live on the internet. Monitored. Ready for real users.

  VERCEL DEPLOY:
  [ ] Connect GitHub repo to Vercel
  [ ] Add all environment variables to Vercel dashboard
  [ ] Verify production build succeeds
  [ ] Custom domain configured — linksnapr.app or similar
  [ ] Test full flow on production URL

  RAILWAY DEPLOY:
  [ ] Create Railway account
  [ ] Connect snapgif-service/ to Railway
  [ ] Add environment variables to Railway
  [ ] Verify Docker build and deploy succeed
  [ ] Add SNAPGIF_SERVICE_URL to Vercel environment variables
  [ ] Test SnapGIF generation end to end on production

  MONITORING:
  [ ] Vercel Analytics enabled
  [ ] Error alerting configured
  [ ] Monitor Agent activated — watching both Vercel and Railway
  [ ] Uptime check on main URL and SnapGIF service URL

  LAUNCH CHECKLIST:
  [ ] Test entire flow on iPhone — paste URL, get card, share, upgrade prompt
  [ ] Test on Android
  [ ] Test on desktop
  [ ] All Lighthouse scores above 90
  [ ] No console errors in production
  [ ] Security Agent final production review
  [ ] Share on Twitter, Reddit, ProductHunt

  Phase 6 complete when: real users are using the product and Monitor Agent is watching.

═══════════════════════════════════════════════════════════════
## BLOCKERS
═══════════════════════════════════════════════════════════════

Active blockers that are preventing progress. Clear these first.

  None currently. Phase 0 is clear to proceed.

  Upcoming known blockers:
  - Railway account needed before Phase 4 can start
  - Must have real free tier users before starting Phase 5
  - linksnapr/ folder contents unknown — run ls before Phase 1

═══════════════════════════════════════════════════════════════
## LAST SESSION SUMMARY
═══════════════════════════════════════════════════════════════

Update this at the end of every session. One paragraph maximum.
This is how context is never lost between sessions.

  Session date:  May 2026
  What was done: Phase 2 fully complete. All 12 files built, reviewed, and committed.
                 lib/ foundation (types, security, rateLimit, freeTier, cache, streaming),
                 4 product agents (scraper, summary, tag, image), orchestrator, and API
                 route. Zero TypeScript errors throughout. Security Agent and Code Review
                 Agent approved every file. Upstash Redis used instead of deprecated
                 Vercel KV. Built-in Node 25 fetch used instead of node-fetch.
  Next action:   Testing Agent review of all Phase 2 files, then Phase 3 Frontend

═══════════════════════════════════════════════════════════════
# END OF TASKS.md
#
# Update the Current Session Focus section every session.
# Update the Last Session Summary before closing every session.
# Move completed items to [x] as each task is finished.
# Add new blockers immediately when discovered.
═══════════════════════════════════════════════════════════════
