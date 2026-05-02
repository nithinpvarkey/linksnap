// Unit tests for lib/security.ts — 49 tests across 13 groups.
// dns.lookup is mocked on every test — no real network calls leave this file.

import {
  validateUrl,
  validateRedirect,
  sanitiseAiOutput,
  extractDomain,
  generateSignedUrl,
  validateSnapGifSecret,
} from '../../../lib/security'

// ─── Mock setup ──────────────────────────────────────────────────────────────

jest.mock('node:dns', () => ({
  promises: {
    lookup: jest.fn(),
  },
}))

// Retrieve via requireMock with an explicit type to avoid TypeScript overload
// resolution issues — dns.promises.lookup has multiple overloads and jest.mocked()
// resolves to a union that rejects .mockResolvedValue() in strict mode.
const mockDnsLookup = jest.requireMock<{
  promises: {
    lookup: jest.MockedFunction<
      (hostname: string) => Promise<{ address: string; family: number }>
    >
  }
}>('node:dns').promises.lookup

// ─── Constants ────────────────────────────────────────────────────────────────

const PUBLIC_DNS_RESPONSE = { address: '151.101.0.81', family: 4 } as const
const VALID_URL = 'https://www.bbc.com/news'
const TEST_SECRET = 'test-snapgif-secret-32chars-xyz'

// ─── Test lifecycle ───────────────────────────────────────────────────────────

beforeEach(() => {
  jest.resetAllMocks()
  mockDnsLookup.mockResolvedValue(PUBLIC_DNS_RESPONSE)
})

afterEach(() => {
  delete process.env['SNAPGIF_SECRET']
  jest.restoreAllMocks()
})

// ═════════════════════════════════════════════════════════════════════════════
// validateUrl
// ═════════════════════════════════════════════════════════════════════════════

describe('validateUrl', () => {

  // ─── Group 1: Valid URLs ───────────────────────────────────────────────────

  describe('Group 1 — valid URLs', () => {
    it('should return valid:true and the hostname for a valid https URL', async () => {
      // Arrange: DNS resolves to public IP (set in beforeEach)
      // Act
      const result = await validateUrl('https://www.bbc.com/news')
      // Assert
      expect(result).toEqual({ valid: true, hostname: 'www.bbc.com' })
    })

    it('should return valid:true and the hostname for a valid http URL', async () => {
      // Arrange
      mockDnsLookup.mockResolvedValue({ address: '93.184.216.34', family: 4 })
      // Act
      const result = await validateUrl('http://example.com')
      // Assert
      expect(result).toEqual({ valid: true, hostname: 'example.com' })
    })
  })

  // ─── Group 2: Blocked schemes ─────────────────────────────────────────────

  describe('Group 2 — blocked schemes', () => {
    it('should block the javascript: scheme', async () => {
      const result = await validateUrl('javascript:alert(1)')
      expect(result.valid).toBe(false)
    })

    it('should block the file:// scheme', async () => {
      const result = await validateUrl('file:///etc/passwd')
      expect(result.valid).toBe(false)
    })

    it('should block the data: scheme', async () => {
      const result = await validateUrl('data:text/html,<h1>hi</h1>')
      expect(result.valid).toBe(false)
    })

    it('should block the ftp:// scheme', async () => {
      const result = await validateUrl('ftp://example.com')
      expect(result.valid).toBe(false)
    })
  })

  // ─── Group 3: Empty and unparseable input ─────────────────────────────────

  describe('Group 3 — empty and unparseable input', () => {
    it('should block an empty string', async () => {
      const result = await validateUrl('')
      expect(result.valid).toBe(false)
    })

    it('should block a plain non-URL string', async () => {
      const result = await validateUrl('not a url at all')
      expect(result.valid).toBe(false)
    })

    it('should block a whitespace-only string', async () => {
      const result = await validateUrl('   ')
      expect(result.valid).toBe(false)
    })
  })

  // ─── Group 4: URL length boundary ─────────────────────────────────────────

  describe('Group 4 — URL length boundary', () => {
    it('should allow a URL at exactly 2048 characters — at the limit', async () => {
      // Arrange
      const base = 'https://example.com/'
      const urlAt2048 = base + 'a'.repeat(2048 - base.length)
      expect(urlAt2048).toHaveLength(2048)
      // Act
      const result = await validateUrl(urlAt2048)
      // Assert: passes all seven steps including DNS
      expect(result.valid).toBe(true)
      expect(mockDnsLookup).toHaveBeenCalled()
    })

    it('should block a URL at 2049 characters and not call DNS — one over the limit', async () => {
      // Arrange
      const base = 'https://example.com/'
      const urlAt2049 = base + 'a'.repeat(2049 - base.length)
      expect(urlAt2049).toHaveLength(2049)
      // Act
      const result = await validateUrl(urlAt2049)
      // Assert: length check at Step 3 fires before DNS at Step 6
      expect(result.valid).toBe(false)
      expect(mockDnsLookup).not.toHaveBeenCalled()
    })
  })

  // ─── Group 5: Blocked loopback hostnames ──────────────────────────────────

  describe('Group 5 — blocked loopback hostnames', () => {
    it('should block http://localhost/', async () => {
      const result = await validateUrl('http://localhost/')
      expect(result.valid).toBe(false)
    })

    it('should block http://127.0.0.1/', async () => {
      const result = await validateUrl('http://127.0.0.1/')
      expect(result.valid).toBe(false)
    })

    it('should block http://0.0.0.0/', async () => {
      const result = await validateUrl('http://0.0.0.0/')
      expect(result.valid).toBe(false)
    })

    it('should block http://[::1]/ — IPv6 loopback address', async () => {
      const result = await validateUrl('http://[::1]/')
      expect(result.valid).toBe(false)
    })
  })

  // ─── Group 6: Raw private IPs in the URL ──────────────────────────────────

  describe('Group 6 — raw private IPs in the URL', () => {
    it('should block http://192.168.1.1/ — RFC 1918 class C range', async () => {
      const result = await validateUrl('http://192.168.1.1/')
      expect(result.valid).toBe(false)
    })

    it('should block http://10.0.0.1/ — RFC 1918 class A range', async () => {
      const result = await validateUrl('http://10.0.0.1/')
      expect(result.valid).toBe(false)
    })

    it('should block http://172.16.0.1/ — RFC 1918 class B range start', async () => {
      const result = await validateUrl('http://172.16.0.1/')
      expect(result.valid).toBe(false)
    })

    it('should block http://172.31.255.255/ — RFC 1918 class B range end', async () => {
      const result = await validateUrl('http://172.31.255.255/')
      expect(result.valid).toBe(false)
    })

    it('should block http://169.254.169.254/ — AWS EC2 instance metadata endpoint', async () => {
      const result = await validateUrl('http://169.254.169.254/')
      expect(result.valid).toBe(false)
    })
  })

  // ─── Group 7: DNS lookup failure ──────────────────────────────────────────

  describe('Group 7 — DNS lookup failure', () => {
    it('should block when DNS lookup throws ENOTFOUND', async () => {
      // Arrange
      mockDnsLookup.mockRejectedValue(new Error('ENOTFOUND non-existent-domain.example'))
      // Act
      const result = await validateUrl('https://non-existent-domain.example/')
      // Assert
      expect(result.valid).toBe(false)
    })

    it('should block when DNS lookup throws ESERVFAIL', async () => {
      // Arrange
      mockDnsLookup.mockRejectedValue(new Error('ESERVFAIL'))
      // Act
      const result = await validateUrl('https://flaky-domain.example/')
      // Assert
      expect(result.valid).toBe(false)
    })
  })

  // ─── Group 8: DNS rebinding prevention — HIGHEST PRIORITY ─────────────────

  describe('Group 8 — DNS rebinding prevention', () => {
    // A domain passes all hostname and IP range checks at Steps 2–5 because
    // its hostname looks legitimate. Only after DNS resolution (Step 6) does
    // the private IP appear. Step 7 must catch every case.

    it('should block when DNS resolves to 192.168.1.1 — DNS rebinding via RFC 1918', async () => {
      // Arrange: hostname passes early steps but DNS resolves into private network
      mockDnsLookup.mockResolvedValue({ address: '192.168.1.1', family: 4 })
      // Act
      const result = await validateUrl('https://evil.example.com')
      // Assert: Step 7 post-DNS check catches the private resolved IP
      expect(result.valid).toBe(false)
      expect(mockDnsLookup).toHaveBeenCalledWith('evil.example.com')
    })

    it('should block when DNS resolves to 10.0.0.1 — DNS rebinding via RFC 1918', async () => {
      // Arrange
      mockDnsLookup.mockResolvedValue({ address: '10.0.0.1', family: 4 })
      // Act
      const result = await validateUrl('https://evil.example.com')
      // Assert
      expect(result.valid).toBe(false)
      expect(mockDnsLookup).toHaveBeenCalledWith('evil.example.com')
    })

    it('should block when DNS resolves to 169.254.169.254 — AWS metadata endpoint via DNS rebinding', async () => {
      // Arrange: the most dangerous DNS rebinding target — exposes cloud credentials
      mockDnsLookup.mockResolvedValue({ address: '169.254.169.254', family: 4 })
      // Act
      const result = await validateUrl('https://evil.example.com')
      // Assert
      expect(result.valid).toBe(false)
      expect(mockDnsLookup).toHaveBeenCalledWith('evil.example.com')
    })

    it('should block when DNS resolves to 172.16.0.1 — DNS rebinding via RFC 1918', async () => {
      // Arrange
      mockDnsLookup.mockResolvedValue({ address: '172.16.0.1', family: 4 })
      // Act
      const result = await validateUrl('https://evil.example.com')
      // Assert
      expect(result.valid).toBe(false)
      expect(mockDnsLookup).toHaveBeenCalledWith('evil.example.com')
    })
  })

})

// ═════════════════════════════════════════════════════════════════════════════
// validateRedirect
// ═════════════════════════════════════════════════════════════════════════════

describe('validateRedirect', () => {

  // ─── Group 9: Redirect hop count enforcement ──────────────────────────────

  describe('Group 9 — redirect hop count enforcement', () => {
    it('should allow a redirect at hopCount 0 with a valid URL', async () => {
      // Act
      const result = await validateRedirect(VALID_URL, 0)
      // Assert: delegates to validateUrl normally
      expect(result.valid).toBe(true)
      expect(mockDnsLookup).toHaveBeenCalled()
    })

    it('should allow a redirect at hopCount 3 — the maximum allowed hop count', async () => {
      // Act
      const result = await validateRedirect(VALID_URL, 3)
      // Assert: exactly at the limit — still allowed
      expect(result.valid).toBe(true)
      expect(mockDnsLookup).toHaveBeenCalled()
    })

    it('should block at hopCount 4 and NOT call DNS — verifying the early return fires before URL validation', async () => {
      // Arrange: hop check inside validateRedirect fires before validateUrl is called,
      // so DNS must never be reached
      // Act
      const result = await validateRedirect(VALID_URL, 4)
      // Assert
      expect(result.valid).toBe(false)
      expect(mockDnsLookup).not.toHaveBeenCalled()
    })

    it('should block at hopCount 10 and NOT call DNS', async () => {
      // Act
      const result = await validateRedirect(VALID_URL, 10)
      // Assert
      expect(result.valid).toBe(false)
      expect(mockDnsLookup).not.toHaveBeenCalled()
    })
  })

})

// ═════════════════════════════════════════════════════════════════════════════
// sanitiseAiOutput
// ═════════════════════════════════════════════════════════════════════════════

describe('sanitiseAiOutput', () => {

  // ─── Group 10: HTML tag stripping and truncation ──────────────────────────

  describe('Group 10 — HTML tag stripping and truncation', () => {
    it('should strip <script> tag delimiters — text content between them is preserved as safe React text', () => {
      // Arrange
      const input = 'Hello <script>alert(1)</script> world'
      // Act
      const result = sanitiseAiOutput(input, 500)
      // Assert: tag delimiters removed — React renders remaining text safely without dangerouslySetInnerHTML
      expect(result).toBe('Hello alert(1) world')
      expect(result).not.toContain('<script>')
      expect(result).not.toContain('</script>')
    })

    it('should strip <b> tags and preserve the text content inside them', () => {
      const result = sanitiseAiOutput('This is <b>bold</b> text', 500)
      expect(result).toBe('This is bold text')
    })

    it('should strip nested tags and preserve only the innermost text content', () => {
      const result = sanitiseAiOutput('<div><p>Important content</p></div>', 500)
      expect(result).toBe('Important content')
    })

    it('should return plain text unchanged when no HTML tags are present', () => {
      const input = 'Just a plain sentence with no tags.'
      expect(sanitiseAiOutput(input, 500)).toBe(input)
    })

    it('should return the full string when its length equals exactly maxLength', () => {
      // Arrange: exactly at the boundary — must not be truncated
      const input = 'a'.repeat(100)
      // Act
      const result = sanitiseAiOutput(input, 100)
      // Assert
      expect(result).toHaveLength(100)
      expect(result).toBe(input)
    })

    it('should truncate to exactly maxLength characters when input exceeds the limit', () => {
      const result = sanitiseAiOutput('a'.repeat(600), 500)
      expect(result).toHaveLength(500)
    })

    it('should trim leading and trailing whitespace that remains after tag stripping', () => {
      // Arrange: '  <div>  some text  </div>  '
      //   stripping <div> and </div> leaves '    some text    ' (4+4 outer spaces)
      //   .trim() removes them
      const input = '  <div>  some text  </div>  '
      // Act
      const result = sanitiseAiOutput(input, 500)
      // Assert
      expect(result).toBe('some text')
    })
  })

})

// ═════════════════════════════════════════════════════════════════════════════
// extractDomain
// ═════════════════════════════════════════════════════════════════════════════

describe('extractDomain', () => {

  // ─── Group 11: Safe domain extraction for logging ─────────────────────────

  describe('Group 11 — safe domain extraction for logging', () => {
    it('should return only the hostname — path and query parameters are stripped', () => {
      // Arrange: URL carries a token in the query string — must never appear in logs
      const result = extractDomain('https://example.com/path?token=secret123&key=abc')
      // Assert: query params that may contain secrets are gone
      expect(result).toBe('example.com')
    })

    it('should return the full subdomain when present in the hostname', () => {
      expect(extractDomain('https://api.example.com/v1/data')).toBe('api.example.com')
    })

    it('should return the hostname without the port number', () => {
      // WHATWG URL .hostname property excludes the port — .host includes it
      expect(extractDomain('https://example.com:8080/page')).toBe('example.com')
    })

    it('should return "unknown" for an invalid URL string — never throws', () => {
      expect(extractDomain('not a url')).toBe('unknown')
    })

    it('should return "unknown" for an empty string — never throws', () => {
      expect(extractDomain('')).toBe('unknown')
    })
  })

})

// ═════════════════════════════════════════════════════════════════════════════
// generateSignedUrl
// ═════════════════════════════════════════════════════════════════════════════

describe('generateSignedUrl', () => {

  // ─── Group 12: HMAC-signed URL generation ─────────────────────────────────

  describe('Group 12 — HMAC-signed URL generation', () => {
    it('should return a URL containing the expires and sig query parameters', () => {
      // Arrange
      process.env['SNAPGIF_SECRET'] = TEST_SECRET
      // Act
      const signed = generateSignedUrl('/gifs/card-abc123.gif')
      // Assert
      expect(signed).toContain('?expires=')
      expect(signed).toContain('&sig=')
    })

    it('should throw when SNAPGIF_SECRET is not configured — misconfigured environments must fail loudly', () => {
      // Arrange: silently issuing unsigned URLs would be worse than failing
      delete process.env['SNAPGIF_SECRET']
      // Act & Assert
      expect(() => generateSignedUrl('/gifs/card-abc123.gif')).toThrow(
        'SNAPGIF_SECRET environment variable is not configured',
      )
    })

    it('should produce different signatures for different paths when time is fixed', () => {
      // Arrange: freeze time so expiry is identical — any sig difference comes from path alone
      process.env['SNAPGIF_SECRET'] = TEST_SECRET
      jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)
      // Act
      const signedA = generateSignedUrl('/gifs/card-aaa.gif')
      const signedB = generateSignedUrl('/gifs/card-bbb.gif')
      // Assert: different paths → different HMAC payloads → different signatures
      const sigA = new URL(signedA, 'https://base.example').searchParams.get('sig')
      const sigB = new URL(signedB, 'https://base.example').searchParams.get('sig')
      expect(sigA).not.toBeNull()
      expect(sigB).not.toBeNull()
      expect(sigA).not.toBe(sigB)
    })

    it('should produce identical output for the same path when Date.now is fixed — signature is deterministic', () => {
      // Arrange: same path + same frozen timestamp → same HMAC payload → same output
      process.env['SNAPGIF_SECRET'] = TEST_SECRET
      jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)
      // Act
      const signedFirst  = generateSignedUrl('/gifs/card-abc123.gif')
      const signedSecond = generateSignedUrl('/gifs/card-abc123.gif')
      // Assert
      expect(signedFirst).toBe(signedSecond)
    })
  })

})

// ═════════════════════════════════════════════════════════════════════════════
// validateSnapGifSecret
// ═════════════════════════════════════════════════════════════════════════════

describe('validateSnapGifSecret', () => {

  // ─── Group 13: Constant-time secret validation ────────────────────────────

  describe('Group 13 — constant-time secret validation', () => {
    it('should return true when the request secret matches the environment secret', () => {
      // Arrange
      process.env['SNAPGIF_SECRET'] = 'correct-secret-xyz'
      // Act & Assert
      expect(validateSnapGifSecret('correct-secret-xyz')).toBe(true)
    })

    it('should return false when the request secret does not match the environment secret', () => {
      // Arrange
      process.env['SNAPGIF_SECRET'] = 'correct-secret-xyz'
      // Act & Assert
      expect(validateSnapGifSecret('wrong-secret')).toBe(false)
    })

    it('should return false when SNAPGIF_SECRET is not configured — fails safely without throwing', () => {
      // Arrange: env var absent
      delete process.env['SNAPGIF_SECRET']
      // Act & Assert
      expect(validateSnapGifSecret('any-secret')).toBe(false)
    })
  })

})
