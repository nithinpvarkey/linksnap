# Security Rules

Security rules are never negotiable. Never skip. Never rush.

API KEY RULES:
  - All keys live in .env.local only — never written into any code file
  - .env.local is always in .gitignore and never committed to git ever
  - Keys are accessed server-side only — never sent to the browser
  - Never log any key in any form — not even first few characters
  - Never include keys in any error messages shown to users

REQUIRED ENVIRONMENT VARIABLES:
  GEMINI_API_KEY          — Google AI Studio
  OPENROUTER_API_KEY      — OpenRouter for Qwen, DeepSeek, GLM-5
  SNAPGIF_SECRET          — shared secret between Vercel and Docker
  SNAPGIF_SERVICE_URL     — Railway URL of the Docker SnapGIF service

URL VALIDATION — every URL must pass all checks before any processing:
  - Must use http or https scheme only — everything else blocked
  - Block all other schemes including javascript, file, data, and ftp
  - Block private IP ranges — 192.168.x.x, 10.x.x.x, 172.16 to 172.31.x.x
  - Block localhost, 127.0.0.1, and 0.0.0.0
  - Block all internal hostnames with no public TLD
  - Maximum URL length is 2048 characters
  - Must have a valid domain with a recognised top-level domain

RATE LIMITING:
  - Maximum 10 API requests per minute per IP address
  - Maximum 3 summaries per day per free user tracked in localStorage
  - Maximum 10 GIFs per day per Pro account
  - Always return HTTP 429 status code when any limit is exceeded

AI OUTPUT RULES:
  - All AI output sanitised before displaying to any user
  - Never use dangerouslySetInnerHTML anywhere in the codebase ever
  - Strip all HTML tags from every AI response before rendering
  - Maximum summary length is 500 characters
  - Maximum length of each individual tag is 50 characters

HTTP SECURITY:
  - Security headers in next.config.js — Content-Security-Policy,
    X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy
  - All external links use rel="noopener noreferrer"
  - Docker SnapGIF endpoint only accepts requests carrying SNAPGIF_SECRET
  - GIF download links are cryptographically signed and expire after 1 hour
  - Never expose internal error details — always show friendly generic messages
