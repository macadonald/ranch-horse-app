'use client'
import Sidebar from '@/components/Sidebar'

export default function BoardPage() {
  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar />
      <main style={{ flex: 1, overflowY: 'auto', background: 'var(--color-bg)' }}>
        <div style={{
          background: 'var(--color-surface)',
          borderBottom: '1px solid var(--color-border)',
          padding: '16px 32px',
        }}>
          <h1 style={{
            fontFamily: 'var(--font-display)',
            fontSize: 22,
            fontWeight: 700,
          }}>Assignment Board</h1>
          <p style={{ fontSize: 13, color: 'var(--color-text-3)', marginTop: 2 }}>
            Daily ride schedule and horse assignments
          </p>
        </div>
        <div style={{
          padding: 32,
          textAlign: 'center',
          color: 'var(--color-text-3)',
          paddingTop: 80,
        }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>▦</div>
          <p style={{ fontFamily: 'var(--font-display)', fontSize: 16 }}>Coming soon</p>
          <p style={{ fontSize: 13, marginTop: 6, color: 'var(--color-text-muted)' }}>
            Daily assignment board will be added next
          </p>
        </div>
      </main>
    </div>
  )
}
