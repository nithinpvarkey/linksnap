import { ImageResponse } from '@vercel/og'

export const runtime = 'edge'

export function GET(request: Request): ImageResponse {
  const { searchParams } = new URL(request.url)

  const rawTitle  = searchParams.get('title')  ?? 'Untitled page'
  const rawTags   = searchParams.get('tags')   ?? ''
  const rawDomain = searchParams.get('domain') ?? ''

  const title  = rawTitle.slice(0, 150)
  const domain = rawDomain.slice(0, 80)
  const tags   = rawTags
    .split(',')
    .map(t => t.trim().slice(0, 30))
    .filter(Boolean)
    .slice(0, 3)

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', paddingTop: 48, paddingBottom: 48, paddingLeft: 64, paddingRight: 64, backgroundImage: 'linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)' }}>
        <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
          <span style={{ color: '#ffffff', fontWeight: 700, fontSize: 22 }}>⚡ LinkSnapr</span>
          {domain && <span style={{ color: '#94a3b8', fontSize: 16 }}>{domain}</span>}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, justifyContent: 'center', gap: 20 }}>
          <div style={{ display: 'flex', color: '#ffffff', fontWeight: 700, fontSize: 52, lineHeight: 1.25, maxHeight: 130, overflow: 'hidden' }}>{title}</div>
          {tags.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'row', gap: 10 }}>
              {tags.map((tag, i) => (
                <div key={i} style={{ display: 'flex', background: 'rgba(255,255,255,0.10)', color: '#ffffff', borderRadius: 9999, paddingTop: 6, paddingBottom: 6, paddingLeft: 16, paddingRight: 16, fontSize: 15 }}>{tag}</div>
              ))}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
          <span style={{ color: '#94a3b8', fontSize: 13 }}>Powered by SnapKeep</span>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  )
}
