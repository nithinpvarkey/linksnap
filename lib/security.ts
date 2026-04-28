import { promises as dns } from 'node:dns'
import { createHmac, createHash, timingSafeEqual } from 'node:crypto'

/**
 * Result of URL validation — used by validateUrl and validateRedirect.
 * The reason field on failure is for server-side logging only.
 * Never expose reason to users — always return a generic message instead.
 */
export type UrlValidationResult =
  | { valid: true;  hostname: string }
  | { valid: false; reason: string }

// ─── Private helpers ─────────────────────────────────────────────────────────

/**
 * Returns true if the IP falls within any private or reserved range.
 * Covers IPv6 loopback and all RFC 1918 + link-local + loopback IPv4 ranges.
 */
function isPrivateIp(ip: string): boolean {
  if (ip === '::1' || ip === '0:0:0:0:0:0:0:1') return true

  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some(n => isNaN(n))) return false

  const [a, b] = parts
  if (a === undefined || b === undefined) return false

  return (
    a === 10 ||                                // 10.0.0.0/8
    a === 127 ||                               // 127.0.0.0/8 loopback
    a === 0 ||                                 // 0.0.0.0/8
    (a === 192 && b === 168) ||               // 192.168.0.0/16
    (a === 172 && b >= 16 && b <= 31) ||      // 172.16.0.0/12
    (a === 169 && b === 254)                   // 169.254.0.0/16 — AWS metadata
  )
}

/**
 * Returns true if the hostname has a valid public TLD.
 * Blocks bare internal hostnames like "http://internal" with no dot.
 */
function hasValidTld(hostname: string): boolean {
  const parts = hostname.split('.')
  if (parts.length < 2) return false
  const tld = parts[parts.length - 1] ?? ''
  return /^[a-zA-Z]{2,}$/.test(tld)
}

// ─── Exported functions ───────────────────────────────────────────────────────

/**
 * Validates a user-provided URL through all 7 security steps in order.
 * Every URL must pass this before any network request is made.
 *
 * Prevents: SSRF (Threat 1), DNS rebinding (Threat 2), access to cloud
 * metadata endpoints like 169.254.169.254, and resource exhaustion (Threat 6).
 *
 * The reason field on failure is for server logs only — never show it to users.
 */
export async function validateUrl(url: string): Promise<UrlValidationResult> {
  // Step 1 — Scheme check: http and https only
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return { valid: false, reason: 'URL could not be parsed' }
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { valid: false, reason: `Blocked scheme: ${parsed.protocol}` }
  }

  // Step 2 — Format check: must have a recognisable TLD
  const hostname = parsed.hostname.toLowerCase()
  if (!hasValidTld(hostname)) {
    return { valid: false, reason: `No valid TLD in hostname: ${hostname}` }
  }

  // Step 3 — Length check: maximum 2048 characters
  if (url.length > 2048) {
    return { valid: false, reason: 'URL exceeds maximum length of 2048 characters' }
  }

  // Step 4 — Hostname check: block known loopback strings
  const blockedHostnames = ['localhost', '127.0.0.1', '::1', '0.0.0.0']
  if (blockedHostnames.includes(hostname)) {
    return { valid: false, reason: `Blocked hostname: ${hostname}` }
  }

  // Step 5 — IP range check: block raw private IPs in the URL itself
  if (isPrivateIp(hostname)) {
    return { valid: false, reason: `Blocked private IP in URL: ${hostname}` }
  }

  // Step 6 — DNS resolution: resolve hostname to actual IP before fetching
  let resolvedIp: string
  try {
    const result = await dns.lookup(hostname)
    resolvedIp = result.address
  } catch {
    return { valid: false, reason: `DNS lookup failed for hostname: ${hostname}` }
  }

  // Step 7 — Post-DNS check: re-check resolved IP against all private ranges.
  // Prevents DNS rebinding — the attacker's domain may have passed Step 5 with
  // a public IP but now resolves to a private one at actual fetch time.
  if (isPrivateIp(resolvedIp)) {
    return { valid: false, reason: `DNS resolved to private IP: ${resolvedIp}` }
  }

  return { valid: true, hostname }
}

/**
 * Validates a single redirect hop during manual redirect following.
 * Runs the full 7-step validateUrl check on every hop.
 * Returns invalid if hopCount exceeds 3.
 *
 * Prevents: redirect-to-private-IP attack (Threat 3).
 * Call once per hop with the incremented hop count.
 */
export async function validateRedirect(
  url: string,
  hopCount: number,
): Promise<UrlValidationResult> {
  if (hopCount > 3) {
    return { valid: false, reason: 'Redirect chain exceeds maximum of 3 hops' }
  }
  return validateUrl(url)
}

/**
 * Strips all HTML tags from AI-generated text and enforces a maximum length.
 * Call this on every string returned by any AI model before it is stored,
 * logged, or sent to the browser.
 *
 * Prevents: AI output injection (Threat 11) and output encoding bypass (Threat 12).
 */
export function sanitiseAiOutput(text: string, maxLength: number): string {
  const stripped = text.replace(/<[^>]*>/g, '')
  return stripped.slice(0, maxLength).trim()
}

/**
 * Extracts the hostname from a URL for safe use in log statements.
 * Strips the path, query parameters, and fragment — all of which may contain
 * tokens or personally identifiable information.
 *
 * Prevents: logging sensitive data (Threat 17).
 * Always use this instead of logging a raw URL.
 */
export function extractDomain(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return 'unknown'
  }
}

/**
 * Creates a cryptographically signed, time-limited download URL for SnapGIF files.
 * The HMAC signature covers both the path and the expiry timestamp — neither can
 * be altered without invalidating the signature. Links expire after 1 hour.
 *
 * Throws if SNAPGIF_SECRET is not configured — misconfigured environments must
 * fail loudly rather than silently issuing unsigned URLs.
 */
export function generateSignedUrl(path: string): string {
  const secret = process.env['SNAPGIF_SECRET']
  if (!secret) {
    throw new Error('SNAPGIF_SECRET environment variable is not configured')
  }

  const expiresAt = Date.now() + 60 * 60 * 1000
  const payload = `${path}:${expiresAt}`
  const signature = createHmac('sha256', secret).update(payload).digest('hex')

  return `${path}?expires=${expiresAt}&sig=${signature}`
}

/**
 * Validates the SNAPGIF_SECRET header on incoming Docker service requests.
 * Uses constant-time comparison to prevent timing side-channel attacks — an
 * attacker cannot infer the expected secret by measuring comparison duration.
 *
 * Both values are hashed with SHA-256 before comparison to guarantee equal
 * buffer lengths. timingSafeEqual throws if lengths differ, which would itself
 * be a timing oracle.
 *
 * Prevents: SnapGIF secret bypass (Threat 14).
 */
export function validateSnapGifSecret(requestSecret: string): boolean {
  const expectedSecret = process.env['SNAPGIF_SECRET']
  if (!expectedSecret) return false

  const a = Buffer.from(createHash('sha256').update(requestSecret).digest('hex'))
  const b = Buffer.from(createHash('sha256').update(expectedSecret).digest('hex'))

  return timingSafeEqual(a, b)
}
