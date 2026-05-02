# CLAUDE.md — LinkSnapr Master Project File

Read this entire file before doing anything in this project.
When in doubt — re-read this file. When still in doubt — stop and ask the owner.

@.claude/rules/security.md
@.claude/rules/design.md
@.claude/rules/stack.md
@.claude/rules/agents.md

═══════════════════════════════════════════════════════════════
## PART 1 — WHO YOU ARE WORKING WITH
═══════════════════════════════════════════════════════════════

Owner:            Solo founder, Kerala, India
Experience:       Zero coding experience
Communication:    Plain English always — never assume technical knowledge
Decision maker:   Owner has final say on everything, always

HOW TO COMMUNICATE WITH THE OWNER:
- Explain in plain English first, show code second
- If you use a technical term, explain it in the same sentence
- Break every explanation into small numbered steps
- Never overwhelm with options — give your best recommendation
- When unsure what owner wants — stop and ask one clear question
- Never ask more than one question at a time
- Confirm before deleting any file or making any destructive change
- Ask before installing any package not already in the approved list

═══════════════════════════════════════════════════════════════
## PART 2 — HOW YOU THINK AND WORK
═══════════════════════════════════════════════════════════════

### Planning First
- For any task with 3 or more steps — write a plan first
- Show the plan to the owner before touching any code
- Wait for explicit approval before starting implementation
- If something goes wrong mid-task — stop, re-plan, show new plan
- Never keep pushing in the wrong direction — catch it early

### Self-Improvement Loop
- After every correction from the owner — write a lesson to tasks/LESSONS.md
- Write the lesson as a clear rule to prevent the exact same mistake again
- Review LESSONS.md at the start of every new session
- The goal is a mistake rate that drops to near zero over time

### Verification Before Done
- Never mark a task complete without proving it works
- Run tests, check logs, demonstrate the feature actually works
- Ask yourself — would a senior engineer approve this?
- Never say "this should work" — verify that it does work

### Elegance Check
- Before finishing any non-trivial task — pause
- Ask yourself — is there a simpler more elegant solution?
- If a fix feels hacky or temporary — implement the proper solution instead
- Skip this only for genuinely simple obvious single-line fixes
- Simple beats clever. Readable beats smart.

### Autonomous Bug Fixing
- When given a bug report — fix it completely without hand-holding
- Read logs, find the root cause, resolve it, verify it is gone
- Never ask the owner to explain what an error means
- Zero context switching required from the owner
- If root cause cannot be found after thorough investigation — then ask

### Core Engineering Principles
- Simplicity first — make every change as simple as possible
- No laziness — find root causes, never apply temporary patches
- Minimal impact — only touch what is necessary for the task
- Never introduce new bugs while fixing existing ones
- Senior developer standards — always, even when it takes longer
- One thing at a time — never build two features simultaneously

═══════════════════════════════════════════════════════════════
## PART 3 — WHAT WE ARE BUILDING
═══════════════════════════════════════════════════════════════

Product name:     LinkSnapr
Parent brand:     SnapKeep ecosystem — LinkSnapr is product number one
Tagline:          Paste any URL. Understand it instantly.
Footer:           Powered by SnapKeep

WHAT IT DOES:
User pastes any URL. Eight AI agents process it in the background.
User receives a beautiful shareable card showing the page title,
thumbnail image, 2-line AI summary, relevant tags, and a shareable link.
Pro users also get SnapGIF — a 5-second animated GIF of the card
that plays automatically in WhatsApp, Slack, iMessage, and Twitter.

FREE TIER — no signup required:
  - 3 summaries per day
  - 2-line AI summary, 3 tags, thumbnail image, shareable card link
  - Powered by SnapKeep watermark on every card
  - Daily limit tracked via localStorage — no database needed for MVP
  - When limit is hit — show upgrade prompt for Pro tier

PRO TIER — $3 per month via Dodo Payments:
  - Unlimited summaries, 5 detailed tags, no watermark
  - SnapGIF — 5-second animated GIF shareable anywhere
  - Smart share, bulk process (50 URLs), export (PNG, PDF, CSV, Notion)
  - Chat with any URL, tweet/LinkedIn generator, compare two URLs
  - Sentiment detection, translation (50+ languages), credibility checker
  - Custom branding

═══════════════════════════════════════════════════════════════
## PART 4 — FOLDER STRUCTURE
═══════════════════════════════════════════════════════════════

Never reorganise this structure without asking the owner first.
Every file has exactly one home — never move files between folders.

linksnapr/
├── CLAUDE.md                     — this file — read before everything
├── .claude/
│   ├── agents/                   — all 10 dev team agent instruction files
│   └── rules/                    — security, design, stack, agents rules
├── tasks/
│   ├── TASKS.md                  — current progress and next actions
│   └── LESSONS.md                — lessons learned after every correction
├── .env.local                    — API keys — never commit this file
├── .env.local.example            — safe to commit — no real keys inside
├── .gitignore
├── next.config.js                — security headers configured here
├── package.json
├── tsconfig.json                 — strict mode always
├── agents/                       — Product Agent TypeScript files (Agents 1–4)
│   ├── scraperAgent.ts
│   ├── summaryAgent.ts
│   ├── tagAgent.ts
│   ├── imageAgent.ts
│   └── orchestrator.ts
├── app/
│   ├── layout.tsx
│   ├── page.tsx                  — homepage with URL input
│   ├── api/
│   │   ├── summarise/route.ts
│   │   └── snapgif/route.ts
│   └── s/[id]/page.tsx           — public shareable card page
├── components/
│   ├── LinkCard.tsx
│   ├── SnapGifButton.tsx
│   ├── UpgradePrompt.tsx
│   ├── SkeletonCard.tsx
│   └── ShareButtons.tsx
├── lib/
│   ├── security.ts
│   ├── rateLimit.ts
│   ├── freeTier.ts
│   ├── cache.ts
│   └── streaming.ts
├── docs/
└── snapgif-service/              — Docker microservice (Agents 5–8)

═══════════════════════════════════════════════════════════════
## PART 5 — CRITICAL RULES
═══════════════════════════════════════════════════════════════

These 20 rules override everything else in every situation.

OWNER RULES:
  1.  Always explain in plain English before showing any code
  2.  Always ask before installing any package not in the approved list
  3.  Always ask before making any product or architecture decision
  4.  Always confirm before deleting any file or folder
  5.  When unsure what owner wants — stop and ask one clear question

BUILD RULES:
  6.  Never skip the Security Agent — not for any reason ever
  7.  Never skip the Testing Agent — not for any reason ever
  8.  Never deploy without all dev agents completing their checklists
  9.  Never build two features at the same time
  10. Always write and show a plan before any task with 3 or more steps

CODE RULES:
  11. Never commit .env.local — ever under any circumstances
  12. Never use dangerouslySetInnerHTML — anywhere in the codebase
  13. Never expose API keys in any file except .env.local
  14. Always use TypeScript strict mode — no any types anywhere ever
  15. Always add full error handling — no unhandled promises anywhere

QUALITY RULES:
  16. Never mark a task done without proving it actually works
  17. Always ask — is there a simpler more elegant solution?
  18. Always find root causes — never apply temporary patches
  19. After every owner correction — write a lesson to tasks/LESSONS.md
  20. Always design and test mobile view first — every single time

═══════════════════════════════════════════════════════════════
# END OF CLAUDE.md
═══════════════════════════════════════════════════════════════
