'use client'

import { LinkCard } from '@/components/LinkCard'

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-lg mx-auto">
        <LinkCard
          url="https://www.bbc.com/news"
          isPro={false}
          onUpgradeNeeded={() => console.log('upgrade')}
        />
      </div>
    </main>
  )
}
