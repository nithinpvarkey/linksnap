import { SkeletonCard } from '@/components/SkeletonCard'

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-lg mx-auto">
        <SkeletonCard />
      </div>
    </main>
  )
}
