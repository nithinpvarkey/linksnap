# The Product Agents and Dev Team Agents

═══════════════════════════════════════════════════════════════
## THE 8 PRODUCT AGENTS
═══════════════════════════════════════════════════════════════

These agents run automatically every time a user pastes a URL.
They live inside TypeScript code files on Vercel and Docker.
Users experience their output — the card and the GIF.
Users never know these agents exist.

LAYER 1 — Vercel — runs on every URL paste:

  Agent 1 — Scraper Agent
    File:         agents/scraperAgent.ts
    Job:          Fetch page HTML and extract title, body text, og:image, favicon
    Tools:        node-fetch and cheerio — no AI needed
    Fallback:     axios then ScrapingBee free credits
    Feeds:        passes clean text to Summary Agent and Tag Agent
                  passes image data to Image Agent

  Agent 2 — Summary Agent
    File:         agents/summaryAgent.ts
    Job:          Write a sharp 2-line summary of the page content
    Primary:      Gemini 2.5 Flash — 1500 free requests per day
    Fallback:     Kimi via OpenRouter then DeepSeek V3
    Input:        clean page text from Scraper Agent
    Output:       2-line summary string — streamed word by word to browser
    Extend for:   sentiment detection, translation — same data same API
    New agent if: completely different data source or responsibility

  Agent 3 — Tag Agent
    File:         agents/tagAgent.ts
    Job:          Generate 5 relevant tags — only 3 shown on free tier
    Primary:      Qwen 3.6 Plus via OpenRouter — 200 free per day
    Fallback:     Gemini 2.5 Flash then DeepSeek V3 then GLM-5
    Input:        clean page text from Scraper Agent
    Output:       array of tag strings — streamed to browser as they arrive
    Extend for:   credibility scoring if it uses same text input
    New agent if: requires external APIs like WHOIS or domain reputation

  Agent 4 — Image Agent
    File:         agents/imageAgent.ts
    Job:          Find the best thumbnail image for the card
    Method:       og:image tag first, then first image over 200px, then favicon
    Tools:        no AI — reads data already fetched by Scraper Agent
    Output:       single image URL — sent to browser immediately on completion
    Note:         fastest agent — result shown first to user

LAYER 2 — Docker on Railway — runs only for Pro SnapGIF requests:

  Agent 5 — Render Agent
    File:         snapgif-service/agents/renderAgent.ts
    Job:          Open the assembled card inside headless Chrome
    Tools:        Puppeteer
    Feeds:        rendered page to Frame Agent

  Agent 6 — Frame Agent
    File:         snapgif-service/agents/frameAgent.ts
    Job:          Screenshot 5 animation states of the card in sequence
    Tools:        Puppeteer screenshot API
    Input:        rendered card from Render Agent
    Feeds:        5 raw frames to Watermark Agent

  Agent 7 — Watermark Agent
    File:         snapgif-service/agents/watermarkAgent.ts
    Job:          Burn SnapKeep logo permanently into every pixel of every frame
    Tools:        node-canvas
    Security:     also embeds invisible card ID inside GIF file metadata
    Input:        5 raw frames from Frame Agent
    Feeds:        5 watermarked frames to GIF Encoder Agent

  Agent 8 — GIF Encoder Agent
    File:         snapgif-service/agents/gifEncoderAgent.ts
    Job:          Stitch all watermarked frames into one 5-second animated GIF
    Tools:        gifencoder
    Input:        5 watermarked frames from Watermark Agent
    Output:       final GIF file sent to user with signed expiring download URL

PRODUCT AGENT RULES:

  Execution:
  - Layer 1 agents always run in parallel — all four fire at the same time
  - Layer 2 agents always run in sequence — each agent feeds into the next
  - Every agent has a hard 3-second timeout then auto-switches to fallback
  - Each agent handles its own errors completely — one failing never crashes others
  - Results stream to browser immediately as each agent finishes — never wait for all

  When to create a new agent vs extend an existing one:
  Before creating a new agent file — answer these three questions:

  Question 1 — Does this task use fundamentally different data sources
               than any existing agent?
  Question 2 — Does this task have a completely separate responsibility
               that would make an existing agent confusing if extended?
  Question 3 — Would adding this to an existing agent make it hard
               to understand, test, or debug?

  If all three answers are NO  → extend an existing agent
  If any answer is YES         → create a new agent file

  Examples of extending existing agents:
  - Sentiment detection uses same page text as Summary Agent → extend Summary Agent
  - Tweet generator reformats existing summary → extend Summary Agent with a mode
  - Translation of existing summary → extend Summary Agent with a language param

  Examples of justified new agents:
  - Credibility checking needs external WHOIS and domain reputation APIs → new agent
  - Compare two URLs needs to run the full pipeline twice → new orchestration agent
  - Monitor watching live pages for changes → completely different responsibility

═══════════════════════════════════════════════════════════════
## THE 10 DEV TEAM AGENTS
═══════════════════════════════════════════════════════════════

These agents build and maintain the product.
They live in .claude/agents/ — read each file for full detail.
Users never know these agents exist.
Activate in this exact order for every feature — never skip any.

  1 — Backend Agent       .claude/agents/backend.md
  2 — Security Agent      .claude/agents/security.md
  3 — Frontend Agent      .claude/agents/frontend.md
  4 — Testing Agent       .claude/agents/testing.md
  5 — Performance Agent   .claude/agents/performance.md
  6 — Code Review Agent   .claude/agents/review.md
  7 — Deployment Agent    .claude/agents/deployment.md
  8 — Monitor Agent       .claude/agents/monitor.md
  9 — Analytics Agent     .claude/agents/analytics.md
  10 — Docs Agent         .claude/agents/docs.md

DEV AGENT RULES:
  - Never skip any agent — all ten sign off on every feature
  - Never deploy without Security Agent approval
  - Never deploy without Testing Agent approval
  - Each agent reads its own .md file before starting any work
  - Each agent completes its full checklist before handing to the next
  - All agents are very strict — no exceptions to any rule ever
  - If any agent is unsure about anything — stop and ask owner immediately
