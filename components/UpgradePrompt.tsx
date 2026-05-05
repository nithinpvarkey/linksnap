'use client'

import { useEffect, useRef } from 'react'
import type { JSX } from 'react'
import { trackEvent } from '@/lib/analytics'

// ─── Types ────────────────────────────────────────────────────────────────────

interface UpgradePromptProps {
  onDismiss: () => void
  onUpgrade: () => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export function UpgradePrompt({ onDismiss, onUpgrade }: UpgradePromptProps): JSX.Element {
  const ctaRef       = useRef<HTMLButtonElement>(null)
  const onDismissRef = useRef(onDismiss)
  onDismissRef.current = onDismiss

  // Focus CTA, fire analytics, register Escape key — all on mount
  useEffect(() => {
    ctaRef.current?.focus()
    trackEvent('upgrade_prompt_shown', { user_tier: 'free' })

    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') onDismissRef.current()
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => { document.removeEventListener('keydown', handleKeyDown) }
  }, [])

  function handleUpgrade(): void {
    trackEvent('upgrade_clicked', { user_tier: 'free' })
    onUpgrade()
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="upgrade-prompt-heading"
      className="w-full rounded-2xl border border-indigo-100 bg-white overflow-hidden shadow-lg"
    >
      {/* Gradient accent — brand moment */}
      <div className="h-1 bg-gradient-to-r from-indigo-400 via-indigo-500 to-purple-500" />

      <div className="p-6 flex flex-col gap-4">

        {/* Icon + heading */}
        <div className="flex flex-col gap-2">
          <span className="text-2xl" aria-hidden="true">⚡</span>
          <h2
            id="upgrade-prompt-heading"
            className="font-semibold text-slate-900 text-xl leading-snug"
          >
            You've used all 3 free summaries today
          </h2>
        </div>

        {/* Body */}
        <p className="text-slate-500 text-sm leading-relaxed">
          Upgrade to Pro for unlimited summaries, 5 tags, no watermark, and SnapGIF — just $3/month.
        </p>

        {/* CTA */}
        <button
          ref={ctaRef}
          type="button"
          onClick={handleUpgrade}
          className="w-full bg-indigo-500 hover:bg-indigo-600 text-white font-semibold rounded-xl py-3 min-h-[44px] transition-colors"
        >
          Upgrade to Pro →
        </button>

        {/* Sub text */}
        <p className="text-slate-400 text-xs text-center">
          Your free summaries reset tomorrow at midnight.
        </p>

        {/* Dismiss — styled as text, semantically a button for keyboard access */}
        <button
          type="button"
          onClick={onDismiss}
          className="w-full text-slate-400 text-sm min-h-[44px] hover:text-slate-600 transition-colors"
        >
          Maybe later
        </button>

      </div>
    </div>
  )
}
