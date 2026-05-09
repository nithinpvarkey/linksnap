import Image             from 'next/image'
import Link              from 'next/link'
import { cache }         from 'react'
import type { JSX }      from 'react'
import type { Metadata } from 'next'
import { getCard }       from '@/lib/cache'

// ─── Request-scoped deduplication ────────────────────────────────────────────
// Both generateMetadata and the page component call getCard with the same id.
// React cache() ensures a single Redis read per request for both consumers.

const fetchCard = cache(getCard)

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getDomainInitial(url: string): string {
  try { return new URL(url).hostname.replace('www.', '')[0]?.toUpperCase() ?? '?' }
  catch { return '?' }
}

// ─── Metadata ─────────────────────────────────────────────────────────────────

export async function generateMetadata(
  { params }: { params: { id: string } },
): Promise<Metadata> {
  const card = await fetchCard(params.id)

  if (!card) {
    return {
      title:       'Card not found — LinkSnapr',
      description: 'This card has expired or does not exist.',
    }
  }

  const shareUrl   = `https://linksnapr.app/s/${params.id}`
  const domain     = new URL(card.url).hostname.replace('www.', '')
  const ogImageUrl = `https://linksnapr.app/api/og?title=${encodeURIComponent(card.title)}&tags=${encodeURIComponent(card.tags.join(','))}&domain=${encodeURIComponent(domain)}`

  return {
    title:       card.title,
    description: card.summary,
    openGraph: {
      title:       card.title,
      description: card.summary,
      url:         shareUrl,
      siteName:    'LinkSnapr',
      type:        'website',
      images:      [{ url: ogImageUrl }],
    },
    twitter: {
      card:        'summary_large_image',
      title:       card.title,
      description: card.summary,
      images:      [ogImageUrl],
    },
  }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function SharePage(
  { params }: { params: { id: string } },
): Promise<JSX.Element> {
  const card = await fetchCard(params.id)

  // ── Not found ───────────────────────────────────────────────────────────────

  if (!card) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <header className="bg-white border-b border-slate-100 py-4 px-4">
          <div className="max-w-lg mx-auto">
            <Link
              href="/"
              className="text-xl font-bold tracking-tight text-slate-900 hover:text-indigo-600 transition-colors duration-150"
            >
              ⚡ LinkSnapr
            </Link>
          </div>
        </header>
        <main className="flex-1 flex flex-col items-center justify-center px-4 gap-5">
          <p className="text-sm text-slate-500 text-center leading-relaxed">
            This card has expired or doesn&apos;t exist.
          </p>
          <Link
            href="/"
            className="text-sm font-medium text-indigo-500 hover:text-indigo-700 transition-colors duration-150"
          >
            Create your own →
          </Link>
        </main>
      </div>
    )
  }

  // ── Card page ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">

      {/* Header */}
      <header className="bg-white border-b border-slate-100 py-4 px-4">
        <div className="max-w-lg mx-auto">
          <Link
            href="/"
            className="text-xl font-bold tracking-tight text-slate-900 hover:text-indigo-600 transition-colors duration-150"
          >
            ⚡ LinkSnapr
          </Link>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 flex flex-col items-center px-4 py-12 gap-8">

        {/* Card — shadow-xl gives it more presence than the homepage card */}
        <article className="w-full max-w-lg rounded-2xl shadow-xl border border-slate-100 bg-white overflow-hidden">

          {/* Image */}
          {card.imageUrl ? (
            <div className="aspect-video w-full relative">
              <Image
                src={card.imageUrl}
                alt={`Thumbnail for ${card.title}`}
                fill
                className="object-cover"
                unoptimized
              />
            </div>
          ) : (
            <div className="aspect-video w-full bg-slate-100 flex items-center justify-center">
              <span className="text-5xl font-semibold text-slate-300 select-none">
                {getDomainInitial(card.url)}
              </span>
            </div>
          )}

          <div className="p-5 flex flex-col gap-4">

            {/* Title */}
            <h1 className="font-semibold text-xl text-slate-900 leading-snug">
              {card.title}
            </h1>

            {/* Tags */}
            {card.tags.length > 0 && (
              <ul role="list" aria-label="Tags" className="flex flex-wrap gap-2">
                {card.tags.map(tag => (
                  <li
                    key={tag}
                    className="bg-indigo-100 text-indigo-700 rounded-full px-3 py-1 text-sm font-medium"
                  >
                    {tag}
                  </li>
                ))}
              </ul>
            )}

            {/* Summary — tap to expand */}
            {card.summary && (
              <details className="mt-1">
                <summary className="cursor-pointer text-sm text-indigo-500 font-medium select-none">
                  Read summary
                </summary>
                <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                  {card.summary}
                </p>
              </details>
            )}

            {/* Footer — original URL + watermark always shown on public page */}
            <div className="flex items-center justify-between pt-1 border-t border-slate-50 gap-2">
              <a
                href={card.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-slate-400 truncate hover:text-slate-600 transition-colors duration-150 min-w-0"
              >
                {card.url}
              </a>
              <span className="text-xs text-slate-400 shrink-0">
                ⚡ Powered by SnapKeep
              </span>
            </div>

          </div>
        </article>

        {/* CTA — acquisition driver */}
        <section className="w-full max-w-lg flex flex-col items-center gap-3">
          <Link
            href="/"
            className="w-full sm:w-auto bg-indigo-500 hover:bg-indigo-600 text-white font-semibold rounded-xl px-8 py-3 min-h-[44px] text-center text-sm transition-colors duration-150"
          >
            Make your own SnapCard →
          </Link>
          <p className="text-xs text-slate-400">Free · No sign-up needed</p>
        </section>

      </main>

      {/* Footer */}
      <footer className="py-6 text-center">
        <Link
          href="/"
          className="text-xs text-slate-400 hover:text-slate-600 transition-colors duration-150"
        >
          Powered by SnapKeep
        </Link>
      </footer>

    </div>
  )
}
