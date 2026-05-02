import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'LinkSnapr — Paste any URL. Understand it instantly.',
  description: 'Get an AI summary, tags, and shareable card for any URL.',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
