import type { JSX } from 'react'

export function SkeletonCard(): JSX.Element {
  return (
    <article
      role="status"
      aria-label="Loading card"
      aria-busy="true"
      className="w-full rounded-2xl shadow-md border border-slate-100 bg-white overflow-hidden"
    >
      {/* Image — aspect-video preserves 16:9 ratio matching LinkCard */}
      <div className="aspect-video w-full bg-slate-200 motion-safe:animate-pulse" />

      <div className="p-4 flex flex-col gap-4">

        {/* Title — two lines, second shorter to feel organic */}
        <div className="flex flex-col gap-2">
          <div className="h-4 bg-slate-200 rounded motion-safe:animate-pulse" />
          <div className="h-4 w-2/3 bg-slate-200 rounded motion-safe:animate-pulse" />
        </div>

        {/* Tags — three free-tier pill shapes */}
        <div className="flex gap-2">
          <div className="h-6 w-16 bg-slate-200 rounded-full motion-safe:animate-pulse" />
          <div className="h-6 w-16 bg-slate-200 rounded-full motion-safe:animate-pulse" />
          <div className="h-6 w-16 bg-slate-200 rounded-full motion-safe:animate-pulse" />
        </div>

        {/* Summary — three lines, last shorter to represent trailing sentence */}
        <div className="flex flex-col gap-2">
          <div className="h-3 bg-slate-200 rounded motion-safe:animate-pulse" />
          <div className="h-3 bg-slate-200 rounded motion-safe:animate-pulse" />
          <div className="h-3 w-3/4 bg-slate-200 rounded motion-safe:animate-pulse" />
        </div>

        {/* Footer — watermark placeholder */}
        <div className="h-3 w-32 bg-slate-200 rounded motion-safe:animate-pulse" />

      </div>
    </article>
  )
}
