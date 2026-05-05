export function trackEvent(name: string, data: Record<string, unknown>): void {
  if (process.env['NODE_ENV'] !== 'production') console.log('[analytics]', name, data)
}
