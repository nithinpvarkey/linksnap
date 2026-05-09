'use client'

import { useState }      from 'react'
import dynamic           from 'next/dynamic'
import type { JSX, ChangeEvent, KeyboardEvent } from 'react'
import { LinkCard }      from '@/components/LinkCard'
import { trackEvent }    from '@/lib/analytics'

// ─── Dynamic imports ──────────────────────────────────────────────────────────

const UpgradePrompt = dynamic(
  () => import('@/components/UpgradePrompt').then(m => ({ default: m.UpgradePrompt })),
  { ssr: false },
)

// ─── Constants ────────────────────────────────────────────────────────────────

// Phase 5 — replace with Clerk auth check when authentication is integrated
const isPro = false

// ─── Types ────────────────────────────────────────────────────────────────────

type Step = {
  number: string
  Icon:   () => JSX.Element
  title:  string
  body:   string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractDomain(url: string): string {
  try { return new URL(url).hostname.replace('www.', '') }
  catch { return 'unknown' }
}

// ─── Step icons ───────────────────────────────────────────────────────────────

function IconPaste(): JSX.Element {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="5" y="4" width="10" height="13" rx="1.5" />
      <path d="M8 4V3a1 1 0 011-1h2a1 1 0 011 1v1" />
    </svg>
  )
}

function IconSparkle(): JSX.Element {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.22 4.22l1.41 1.41M14.36 14.36l1.41 1.41M4.22 15.78l1.41-1.41M14.36 5.64l1.41-1.41" />
      <circle cx="10" cy="10" r="2.5" />
    </svg>
  )
}

function IconCard(): JSX.Element {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2" y="5" width="16" height="12" rx="2" />
      <path d="M6 9h8M6 12h5" />
    </svg>
  )
}

// ─── How it works data ────────────────────────────────────────────────────────

const STEPS: Step[] = [
  {
    number: '01',
    Icon:   IconPaste,
    title:  'Paste any URL',
    body:   'Drop in any link — article, video, product, or post.',
  },
  {
    number: '02',
    Icon:   IconSparkle,
    title:  'AI reads and understands it',
    body:   'Eight AI agents process the page in parallel.',
  },
  {
    number: '03',
    Icon:   IconCard,
    title:  'Get a beautiful shareable card',
    body:   'Title, summary, tags, and thumbnail — ready to share.',
  },
]

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Home(): JSX.Element {
  const [inputValue,   setInputValue]   = useState('')
  const [submittedUrl, setSubmittedUrl] = useState('')
  const [inputError,   setInputError]   = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [showUpgrade,  setShowUpgrade]  = useState(false)

  // ── Input handlers ─────────────────────────────────────────────────────────

  function handleChange(e: ChangeEvent<HTMLInputElement>): void {
    setInputValue(e.target.value)
    if (inputError)   setInputError('')
    if (isProcessing) setIsProcessing(false)
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'Enter') handleSubmit()
  }

  // ── Submit ─────────────────────────────────────────────────────────────────

  function handleSubmit(): void {
    const trimmed = inputValue.trim()

    if (!trimmed) {
      setInputError('Please paste a URL to get started')
      return
    }
    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
      setInputError('Enter a valid URL starting with http:// or https://')
      return
    }
    if (trimmed.length > 2048) {
      setInputError('This URL is too long. Please try a shorter one.')
      return
    }

    setInputError('')
    setIsProcessing(true)
    trackEvent('url_submitted', { url_domain: extractDomain(trimmed), user_tier: 'free' })
    setSubmittedUrl(trimmed)
  }

  // ── Upgrade ────────────────────────────────────────────────────────────────

  function handleUpgradeNeeded(): void {
    setShowUpgrade(true)
  }

  function handleUpgradeDismiss(): void {
    setShowUpgrade(false)
    setSubmittedUrl('')
    setIsProcessing(false)
  }

  function handleUpgrade(): void {
    window.open('https://linksnapr.app/upgrade', '_blank', 'noopener,noreferrer')
  }

  // ── Derived state ──────────────────────────────────────────────────────────

  const isIdle           = !submittedUrl && !showUpgrade
  const showCard         = !!submittedUrl && !showUpgrade
  const isButtonDisabled = isProcessing || !!inputError
  const buttonLabel      = isProcessing ? 'Snapping...' : 'Snap it ⚡'

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      <style>{`
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0);    }
        }
        .anim-fade-up {
          animation: fadeSlideUp 200ms ease-out both;
        }
      `}</style>

      <div className="min-h-screen bg-slate-50 flex flex-col">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <header
          className="bg-white border-b border-slate-100 py-4 px-4 anim-fade-up"
          style={{ animationDelay: '0ms' }}
        >
          <div className="max-w-2xl mx-auto">
            <span className="text-xl font-bold tracking-tight text-slate-900 select-none">
              ⚡ LinkSnapr
            </span>
          </div>
        </header>

        {/* ── Main ────────────────────────────────────────────────────────── */}
        <main className="flex-1 flex flex-col items-center justify-start pt-12 pb-8 px-4 gap-8">

          {/* Hero */}
          <section className="w-full max-w-2xl flex flex-col items-center gap-4">

            {/* Tagline */}
            <p
              className="text-2xl sm:text-3xl font-semibold text-slate-500 text-center leading-snug anim-fade-up"
              style={{ animationDelay: '60ms' }}
            >
              Paste any URL.{' '}
              <span className="text-slate-900">Understand it instantly.</span>
            </p>

            {/* Input island */}
            <div
              className="w-full anim-fade-up"
              style={{ animationDelay: '120ms' }}
            >
              <div
                className={[
                  'w-full bg-white rounded-2xl border transition-shadow duration-150',
                  inputError
                    ? 'border-red-300 shadow-sm'
                    : 'border-slate-200 shadow-sm focus-within:shadow-md focus-within:border-indigo-300',
                ].join(' ')}
              >
                <div className="flex flex-col sm:flex-row">
                  <label htmlFor="url-input" className="sr-only">
                    URL to snap
                  </label>
                  <input
                    id="url-input"
                    type="url"
                    inputMode="url"
                    value={inputValue}
                    onChange={handleChange}
                    onKeyDown={handleKeyDown}
                    placeholder="Paste any URL here..."
                    aria-describedby="url-error"
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    className="flex-1 bg-transparent px-4 py-3.5 text-base text-slate-900 placeholder:text-slate-400 outline-none rounded-t-2xl sm:rounded-l-2xl sm:rounded-tr-none min-w-0"
                  />
                  <div className="px-2 pb-2 sm:py-2 sm:pr-2 sm:pl-0">
                    <button
                      type="button"
                      onClick={handleSubmit}
                      disabled={isButtonDisabled}
                      className={[
                        'w-full sm:w-auto font-semibold rounded-xl px-6 py-3 min-h-[44px]',
                        'text-white transition-colors duration-150 whitespace-nowrap',
                        isButtonDisabled
                          ? 'bg-indigo-400 cursor-not-allowed'
                          : 'bg-indigo-500 hover:bg-indigo-600',
                      ].join(' ')}
                    >
                      {buttonLabel}
                    </button>
                  </div>
                </div>
              </div>

              {/* Fixed-height error area — no layout shift */}
              <div id="url-error" aria-live="polite" className="h-5 mt-1 px-1">
                {inputError && (
                  <p role="alert" className="text-sm text-red-500">{inputError}</p>
                )}
              </div>
            </div>

          </section>

          {/* Card result area */}
          {(showCard || showUpgrade) && (
            <section
              aria-label="Card result"
              aria-live="polite"
              className="w-full max-w-2xl"
            >
              {showUpgrade ? (
                <UpgradePrompt
                  onDismiss={handleUpgradeDismiss}
                  onUpgrade={handleUpgrade}
                />
              ) : (
                <LinkCard
                  url={submittedUrl}
                  isPro={isPro}
                  onUpgradeNeeded={handleUpgradeNeeded}
                />
              )}
            </section>
          )}

          {/* How it works — visible in idle state only */}
          {isIdle && (
            <section
              aria-label="How it works"
              className="w-full max-w-2xl anim-fade-up"
              style={{ animationDelay: '180ms' }}
            >
              <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest text-center mb-6">
                How it works
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {STEPS.map(({ number, Icon, title, body }) => (
                  <div
                    key={number}
                    className="relative bg-white rounded-2xl border border-slate-100 p-5 overflow-hidden flex flex-col gap-3"
                  >
                    {/* Watermark number */}
                    <span
                      aria-hidden="true"
                      className="absolute -top-3 -right-1 text-7xl font-bold text-slate-100 leading-none select-none pointer-events-none"
                    >
                      {number}
                    </span>
                    {/* Step icon */}
                    <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-500 flex items-center justify-center shrink-0">
                      <Icon />
                    </div>
                    {/* Step text */}
                    <div>
                      <p className="text-sm font-semibold text-slate-900 mb-1">{title}</p>
                      <p className="text-sm text-slate-500 leading-relaxed">{body}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

        </main>

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <footer className="py-6 text-center">
          <a
            href="https://linksnapr.app"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-slate-400 hover:text-slate-600 transition-colors duration-150"
          >
            Powered by SnapKeep
          </a>
        </footer>

      </div>
    </>
  )
}
