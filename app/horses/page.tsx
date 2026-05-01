'use client'
import Sidebar from '@/components/Sidebar'
import { HORSES, LEVEL_LABELS } from '@/lib/horses'

const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  active:    { bg: 'var(--color-success-bg)',  text: 'var(--color-success)',  label: 'Active' },
  backup:    { bg: 'var(--color-warning-bg)',   text: 'var(--color-warning)',  label: 'Backup' },
  out:       { bg: 'var(--color-danger-bg)',    text: 'var(--color-danger)',   label: 'Out' },
  lame:      { bg: 'var(--color-danger-bg)',    text: 'var(--color-danger)',   label: 'Lame' },
  donotuse:  { bg: 'var(--color-danger-bg)',    text: 'var(--color-danger)',   label: 'Do Not Use' },
  naughty:   { bg: 'var(--color-danger-bg)',    text: 'var(--color-danger)',   label: 'Naughty' },
}

export default function HorsesPage() {
  const active = HORSES.filter(h => h.status === 'active' || h.status === 'backup')
  const unavailable = HORSES.filter(h => !['active','backup'].includes(h.status))

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar />
      <main style={{ flex: 1, overflowY: 'auto', background: 'var(--color-bg)' }}>
        <div style={{
          background: 'var(--color-surface)',
          borderBottom: '1px solid var(--color-border)',
          padding: '16px 32px',
          position: 'sticky',
          top: 0,
          zIndex: 10,
        }}>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700 }}>
            Horse Roster
          </h1>
          <p style={{ fontSize: 13, color: 'var(--color-text-3)', marginTop: 2 }}>
            {active.length} active horses · {unavailable.length} unavailable
          </p>
        </div>

        <div style={{ padding: 32 }}>
          <SectionTitle>Active Horses</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12, marginBottom: 32 }}>
            {active.map(horse => (
              <HorseCard key={horse.name} horse={horse} />
            ))}
          </div>

          <SectionTitle>Unavailable</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
            {unavailable.map(horse => (
              <HorseCard key={horse.name} horse={horse} dimmed />
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 11,
      fontWeight: 600,
      color: 'var(--color-text-muted)',
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
      marginBottom: 12,
    }}>{children}</div>
  )
}

function HorseCard({ horse, dimmed }: { horse: typeof HORSES[0]; dimmed?: boolean }) {
  const status = STATUS_COLORS[horse.status] || STATUS_COLORS.active

  return (
    <div style={{
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-lg)',
      padding: '14px 16px',
      opacity: dimmed ? 0.6 : 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{
          fontFamily: 'var(--font-display)',
          fontSize: 15,
          fontWeight: 700,
          color: 'var(--color-text)',
        }}>{horse.name}</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <span style={{
            fontSize: 11,
            padding: '2px 7px',
            borderRadius: 999,
            background: 'var(--color-accent-bg)',
            color: 'var(--color-accent)',
            border: '1px solid var(--color-accent-border)',
            fontWeight: 600,
          }}>
            {LEVEL_LABELS[horse.level] || horse.level}
          </span>
          <span style={{
            fontSize: 11,
            padding: '2px 7px',
            borderRadius: 999,
            background: status.bg,
            color: status.text,
            fontWeight: 600,
          }}>
            {status.label}
          </span>
        </div>
      </div>
      <div style={{ fontSize: 12, color: 'var(--color-text-3)', marginBottom: 8 }}>
        Max {horse.weight ?? '—'} lbs · {horse.size}
      </div>
      {horse.notes && (
        <p style={{
          fontSize: 12,
          color: 'var(--color-text-2)',
          lineHeight: 1.5,
          borderTop: '1px solid var(--color-border)',
          paddingTop: 8,
        }}>
          {horse.notes}
        </p>
      )}
    </div>
  )
}
