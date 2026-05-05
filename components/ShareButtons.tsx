'use client'

import { useState, useRef, useEffect } from 'react'
import type { JSX } from 'react'
import { trackEvent } from '@/lib/analytics'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ShareButtonsProps {
  url:     string
  title:   string
  summary: string
}

type ToastState = 'idle' | 'copied' | 'slack'

// ─── Icons ────────────────────────────────────────────────────────────────────

function LinkIcon(): JSX.Element {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M8 12a4 4 0 005.66 0l2-2a4 4 0 00-5.66-5.66l-1 1" />
      <path d="M12 8a4 4 0 00-5.66 0l-2 2a4 4 0 005.66 5.66l1-1" />
    </svg>
  )
}

function CheckIcon(): JSX.Element {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 10l4 4 8-8" />
    </svg>
  )
}

function WhatsAppIcon(): JSX.Element {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M17 10a7 7 0 01-10.5 6.06L3 17l.94-3.5A7 7 0 1117 10z" />
    </svg>
  )
}

function TwitterIcon(): JSX.Element {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path d="M14.75 3h2.5L11 9.27 18.25 17h-4.46L9.87 12.43 5.2 17H2.7l6.61-7.56L2.75 3h4.57l3.56 4.41L14.75 3zm-.89 12.6h1.38L6.16 4.36H4.68l9.18 11.24z" />
    </svg>
  )
}

function SlackIcon(): JSX.Element {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M4 8h12M4 12h12M8 4v12M12 4v12" />
    </svg>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ShareButtons({ url, title, summary }: ShareButtonsProps): JSX.Element {
  const [toast, setToast] = useState<ToastState>('idle')
  const timerRef          = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [])

  function showToast(type: Exclude<ToastState, 'idle'>): void {
    if (timerRef.current) clearTimeout(timerRef.current)
    setToast(type)
    timerRef.current = setTimeout(() => { setToast('idle') }, 2_000)
  }

  async function handleCopy(): Promise<void> {
    try { await navigator.clipboard.writeText(window.location.href) }
    catch { /* clipboard unavailable — silent fail */ }
    trackEvent('share_clicked', { platform: 'copy', user_tier: 'free' })
    showToast('copied')
  }

  async function handleSlack(): Promise<void> {
    const message = `*${title}*\n${summary}\n${url}`
    try { await navigator.clipboard.writeText(message) }
    catch { /* clipboard unavailable — silent fail */ }
    trackEvent('share_clicked', { platform: 'slack', user_tier: 'free' })
    showToast('slack')
  }

  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(`${title} — ${url}`)}`
  const twitterUrl  = `https://twitter.com/intent/tweet?text=${encodeURIComponent(`${summary.slice(0, 240)} — ${url}`)}`

  const base    = 'flex items-center justify-center rounded-lg p-2.5 min-h-[44px] min-w-[44px] transition-colors'
  const idle    = `${base} bg-slate-100 text-slate-600 hover:bg-slate-200`
  const success = `${base} bg-green-50 text-green-600 hover:bg-green-100`

  return (
    <div>
      <div role="group" aria-label="Share options" className="flex gap-2">

        {/* Copy link */}
        <button
          type="button"
          aria-label="Copy link"
          onClick={() => { void handleCopy() }}
          className={toast === 'copied' ? success : idle}
        >
          {toast === 'copied' ? <CheckIcon /> : <LinkIcon />}
        </button>

        {/* WhatsApp */}
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Share on WhatsApp"
          onClick={() => { trackEvent('share_clicked', { platform: 'whatsapp', user_tier: 'free' }) }}
          className={idle}
        >
          <WhatsAppIcon />
        </a>

        {/* Twitter / X */}
        <a
          href={twitterUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Share on Twitter"
          onClick={() => { trackEvent('share_clicked', { platform: 'twitter', user_tier: 'free' }) }}
          className={idle}
        >
          <TwitterIcon />
        </a>

        {/* Slack — copies formatted message to clipboard */}
        <button
          type="button"
          aria-label="Copy for Slack"
          onClick={() => { void handleSlack() }}
          className={toast === 'slack' ? success : idle}
        >
          {toast === 'slack' ? <CheckIcon /> : <SlackIcon />}
        </button>

      </div>

      {/* Toast — fixed height prevents layout shift when message appears */}
      <div aria-live="polite" className="h-5 mt-1">
        {toast !== 'idle' && (
          <p className="text-sm text-green-600">
            {toast === 'copied' ? 'Link copied!' : 'Copied for Slack!'}
          </p>
        )}
      </div>
    </div>
  )
}
