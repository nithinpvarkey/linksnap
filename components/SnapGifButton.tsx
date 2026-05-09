'use client'

import { useState } from 'react'
import type { JSX } from 'react'
import { trackEvent } from '@/lib/analytics'

// ─── Types ────────────────────────────────────────────────────────────────────

interface SnapGifButtonProps {
  url:             string
  isPro:           boolean
  onUpgradeNeeded: () => void
}

type GifStatus = 'idle' | 'generating' | 'success' | 'error'

// ─── Icons ────────────────────────────────────────────────────────────────────

function SparkleIcon(): JSX.Element {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 2v2M9 14v2M2 9h2M14 9h2M3.64 3.64l1.41 1.41M12.95 12.95l1.41 1.41M3.64 14.36l1.41-1.41M12.95 5.05l1.41-1.41" />
      <circle cx="9" cy="9" r="2.5" />
    </svg>
  )
}

function SpinnerIcon(): JSX.Element {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
      aria-hidden="true"
      className="animate-spin"
    >
      <circle cx="9" cy="9" r="7" strokeOpacity="0.25" />
      <path d="M16 9a7 7 0 00-7-7" />
    </svg>
  )
}

function CheckIcon(): JSX.Element {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 9l4 4 8-8" />
    </svg>
  )
}

function LockIcon(): JSX.Element {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="8" width="12" height="9" rx="2" />
      <path d="M6 8V5.5a3 3 0 016 0V8" />
    </svg>
  )
}

function AlertIcon(): JSX.Element {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="9" cy="9" r="7" />
      <path d="M9 6v3.5" strokeWidth="2" />
      <circle cx="9" cy="12.5" r="0.75" fill="currentColor" stroke="none" />
    </svg>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SnapGifButton({ url, isPro, onUpgradeNeeded }: SnapGifButtonProps): JSX.Element {
  const [status,   setStatus]   = useState<GifStatus>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  // ── Free tier — teaser that opens the upgrade prompt ──────────────────────

  if (!isPro) {
    return (
      <button
        type="button"
        onClick={() => {
          trackEvent('snapgif_upgrade_prompt', { user_tier: 'free' })
          onUpgradeNeeded()
        }}
        aria-label="Unlock SnapGIF — Pro feature"
        className="w-full flex items-center justify-center gap-2.5 rounded-xl py-3 min-h-[44px] bg-indigo-50 border border-indigo-100 text-indigo-400 text-sm font-medium transition-colors hover:bg-indigo-100"
      >
        <LockIcon />
        <span>SnapGIF</span>
        <span className="text-xs font-normal text-indigo-300">· Pro only</span>
      </button>
    )
  }

  // ── Error ─────────────────────────────────────────────────────────────────

  if (status === 'error') {
    return (
      <div className="w-full flex items-center gap-3 rounded-xl bg-red-50 border border-red-100 px-4 py-3 min-h-[44px]">
        <span className="shrink-0 text-red-500"><AlertIcon /></span>
        <p className="flex-1 text-sm text-red-600 leading-snug">{errorMsg}</p>
        <button
          type="button"
          onClick={() => { setStatus('idle'); setErrorMsg('') }}
          className="shrink-0 min-h-[44px] px-1 text-sm font-medium text-red-500 hover:text-red-700 transition-colors"
        >
          Retry
        </button>
      </div>
    )
  }

  // ── Success ───────────────────────────────────────────────────────────────

  if (status === 'success') {
    return (
      <div className="w-full flex items-center justify-center gap-2 rounded-xl py-3 min-h-[44px] bg-green-50 border border-green-100 text-green-600 text-sm font-medium">
        <CheckIcon />
        <span>GIF downloaded!</span>
      </div>
    )
  }

  // ── Generating ────────────────────────────────────────────────────────────

  if (status === 'generating') {
    return (
      <div
        aria-live="polite"
        className="w-full flex items-center justify-center gap-2.5 rounded-xl py-3 min-h-[44px] bg-indigo-500 text-white text-sm font-medium cursor-wait"
      >
        <SpinnerIcon />
        <span>Generating GIF…</span>
      </div>
    )
  }

  // ── Idle (Pro) ────────────────────────────────────────────────────────────

  async function handleGenerate(): Promise<void> {
    setStatus('generating')
    trackEvent('snapgif_started', { user_tier: 'pro' })

    try {
      const response = await fetch('/api/snapgif', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ url }),
      })

      if (!response.ok) {
        const message =
          response.status === 402 ? 'Daily GIF limit reached. Try again tomorrow.' :
          response.status === 429 ? 'Too many requests. Please wait a moment.'     :
                                    'Could not generate GIF. Please try again.'
        setErrorMsg(message)
        setStatus('error')
        trackEvent('snapgif_error', { user_tier: 'pro', http_status: response.status })
        return
      }

      const blob      = await response.blob()
      const objectUrl = URL.createObjectURL(blob)
      const anchor    = document.createElement('a')
      anchor.href     = objectUrl
      anchor.download = 'linksnapr.gif'
      document.body.appendChild(anchor)
      anchor.click()
      document.body.removeChild(anchor)
      URL.revokeObjectURL(objectUrl)

      setStatus('success')
      trackEvent('snapgif_downloaded', { user_tier: 'pro' })
      setTimeout(() => { setStatus('idle') }, 3_000)

    } catch {
      setErrorMsg('Connection failed. Please try again.')
      setStatus('error')
      trackEvent('snapgif_error', { user_tier: 'pro', http_status: 0 })
    }
  }

  return (
    <button
      type="button"
      onClick={() => { void handleGenerate() }}
      aria-label="Download card as animated GIF"
      className="w-full flex items-center justify-center gap-2.5 rounded-xl py-3 min-h-[44px] bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-semibold transition-colors"
    >
      <SparkleIcon />
      <span>Download as GIF</span>
    </button>
  )
}
