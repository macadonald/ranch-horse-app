'use client'
import { useState, useEffect, useRef } from 'react'
import Sidebar from '@/components/Sidebar'
import { GuestAnalyticsPanel, type AnalyticsGuest } from '@/components/GuestAnalyticsPanel'
import { HorseAnalyticsPanel } from '@/components/HorseAnalyticsPanel'
import { ShoeAnalyticsPanel } from '@/components/ShoeAnalyticsPanel'
import { DbHorse } from '@/lib/horses'
import { getTucsonToday } from '@/lib/timezone'
import { WEIGHT_BANDS } from '@/lib/weightBands'
import type { Finding, FindingCategory, DetectorStatus } from '@/lib/patterns/index'

type AnalyticsView = 'correlations' | 'guests' | 'horses' | 'shoes'

const LEVELS = ['B', 'AB', 'I', 'AI', 'A']
const LEVEL_LABELS: Record<string, string> = {
  B: 'Beginner', AB: 'Adv Beginner', I: 'Intermediate', AI: 'Adv Intermediate', A: 'Advanced',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '12px 14px', textAlign: 'center' }}>
      <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--color-text)' }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--color-text-3)', marginTop: 3 }}>{label}</div>
    </div>
  )
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
      {title}
    </div>
  )
}

const SEC_STYLE: React.CSSProperties = {
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-lg)',
  padding: '14px 16px',
  marginBottom: 14,
}

// ─── Category config ──────────────────────────────────────────────────────────

const CAT_EMOJI: Record<string, string> = {
  calendar: '📅', guests: '👥', weather: '🌡️', swaps: '🔄', health: '🏥', shoes: '🔧', horses: '🐴',
}
const CAT_LABELS: Array<{ key: string; label: string }> = [
  { key: 'all',      label: 'All'      },
  { key: 'horses',   label: 'Horses'   },
  { key: 'health',   label: 'Health'   },
  { key: 'swaps',    label: 'Swaps'    },
  { key: 'shoes',    label: 'Shoes'    },
  { key: 'calendar', label: 'Calendar' },
  { key: 'guests',   label: 'Guests'   },
  { key: 'weather',  label: 'Weather'  },
]

function toTucsonTime(isoStr: string): string {
  const d = new Date(new Date(isoStr).getTime() - 7 * 60 * 60 * 1000)
  const h = d.getUTCHours(), m = d.getUTCMinutes()
  const ampm = h >= 12 ? 'PM' : 'AM'
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`
}

// ─── PatternsSection ─────────────────────────────────────────────────────────

type ExplainResult = {
  meaning: string[]
  howToCheck: string[]
  whatToDo: string[]
  howSure: string
}

function ExplainSection({ label, items }: { label: string; items: string[] }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 3 }}>{label}</div>
      {items.map((item, i) => (
        <div key={i} style={{ fontSize: 12, color: 'var(--color-text-2)', paddingLeft: 8, marginBottom: 2 }}>• {item}</div>
      ))}
    </div>
  )
}

function FindingCard({ f, isAdmin, onRefresh }: { f: Finding; isAdmin: boolean; onRefresh: () => void }) {
  const [explainOpen,  setExplainOpen]  = useState(false)
  const [explanation,  setExplanation]  = useState<ExplainResult | null>(null)
  const [explaining,   setExplaining]   = useState(false)
  const [explainError, setExplainError] = useState<string | null>(null)
  const [voteState,    setVoteState]    = useState<'none' | 'liked' | 'hidden'>('none')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleExplain = async () => {
    if (explainOpen) { setExplainOpen(false); return }
    setExplainOpen(true)
    if (explanation) return
    setExplaining(true)
    setExplainError(null)
    try {
      const res = await fetch('/api/patterns/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ finding: f }),
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error || 'Failed')
      setExplanation(data)
    } catch (e) {
      setExplainError(e instanceof Error ? e.message : 'Explanation failed')
    } finally {
      setExplaining(false)
    }
  }

  const handleVote = async (vote: 'up' | 'down') => {
    await fetch('/api/patterns/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ findingId: f.id, factsHash: f.factsHash, vote, title: f.title }),
    }).catch(() => {})
    if (vote === 'down') {
      setVoteState('hidden')
      timerRef.current = setTimeout(() => { onRefresh() }, 4000)
    } else {
      setVoteState('liked')
      setTimeout(() => setVoteState('none'), 2000)
    }
  }

  const handleUndo = async () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
    await fetch('/api/patterns/feedback', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ findingId: f.id, factsHash: f.factsHash }),
    }).catch(() => {})
    setVoteState('none')
  }

  if (voteState === 'hidden') {
    return (
      <div style={{ padding: '12px 0', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 12, color: 'var(--color-text-3)', flex: 1, fontStyle: 'italic' }}>Hidden — marked not useful</span>
        <button onClick={handleUndo} style={{ background: 'none', border: 'none', padding: 0, fontSize: 12, color: 'var(--color-accent)', cursor: 'pointer', fontWeight: 600 }}>Undo</button>
      </div>
    )
  }

  return (
    <div style={{ padding: '12px 0', borderBottom: '1px solid var(--color-border)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <span style={{ fontSize: 16, lineHeight: 1.3, flexShrink: 0 }}>{CAT_EMOJI[f.category] || '•'}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 4 }}>
            <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--color-text)', marginBottom: 3 }}>{f.title}</div>
            {isAdmin && f.kind === 'action' && (
              <div style={{ display: 'flex', gap: 1, flexShrink: 0 }}>
                <button onClick={() => handleVote('up')} title="Useful" style={{ background: 'none', border: 'none', padding: '1px 3px', fontSize: 13, cursor: 'pointer', opacity: voteState === 'liked' ? 1 : 0.35 }}>👍</button>
                <button onClick={() => handleVote('down')} title="Not useful" style={{ background: 'none', border: 'none', padding: '1px 3px', fontSize: 13, cursor: 'pointer', opacity: 0.35 }}>👎</button>
              </div>
            )}
          </div>
          <div style={{ fontSize: 12, color: 'var(--color-text-2)', marginBottom: 5 }}>{f.detail}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: 'var(--color-text-3)' }}>Based on {f.nLabel}</span>
            <span style={{
              padding: '1px 7px', borderRadius: 999, fontSize: 10, fontWeight: 700,
              background: f.strength === 'strong' ? '#f0fdf4' : 'var(--color-bg)',
              color:      f.strength === 'strong' ? '#15803d' : 'var(--color-text-3)',
              border: `1px solid ${f.strength === 'strong' ? '#86efac' : 'var(--color-border)'}`,
            }}>
              {f.strength === 'strong' ? 'Strong' : 'Moderate'}
            </span>
            {f.kind === 'action' && (
              <button onClick={handleExplain} disabled={explaining} style={{
                background: 'none', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
                padding: '1px 8px', fontSize: 11, color: 'var(--color-accent)', cursor: 'pointer', fontWeight: 600,
              }}>
                {explaining ? 'Thinking…' : explainOpen ? 'Close' : 'Explain'}
              </button>
            )}
          </div>

          {explainOpen && (
            <div style={{ marginTop: 10, padding: '10px 12px', background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)' }}>
              {explaining ? (
                <p style={{ fontSize: 12, color: 'var(--color-text-3)', margin: 0 }}>Generating explanation…</p>
              ) : explainError ? (
                <p style={{ fontSize: 12, color: '#c2410c', margin: 0 }}>{explainError}</p>
              ) : explanation ? (
                <>
                  <ExplainSection label="What this means" items={explanation.meaning} />
                  <ExplainSection label="How to check" items={explanation.howToCheck} />
                  <ExplainSection label="What to do" items={explanation.whatToDo} />
                  <div style={{ marginTop: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>How sure: </span>
                    <span style={{ fontSize: 11, color: 'var(--color-text-2)' }}>{explanation.howSure}</span>
                  </div>
                </>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function PatternsSection() {
  const [findings,    setFindings]    = useState<Finding[]>([])
  const [statuses,    setStatuses]    = useState<DetectorStatus[]>([])
  const [generatedAt, setGeneratedAt] = useState<string | null>(null)
  const [isAdmin,     setIsAdmin]     = useState(false)
  const [hiddenCount, setHiddenCount] = useState(0)
  const [showHidden,  setShowHidden]  = useState(false)
  const [loading,      setLoading]      = useState(true)
  const [refreshing,   setRefreshing]   = useState(false)
  const [refreshNote,  setRefreshNote]  = useState<'ok' | 'error' | null>(null)
  const [catFilter,    setCatFilter]    = useState<string>('all')
  const [bgOpen,       setBgOpen]       = useState(false)
  const prevIdsRef = useRef<string>('')

  const doFetch = (isRefresh: boolean, sh: boolean) => {
    if (isRefresh) setRefreshing(true)
    const params = new URLSearchParams()
    if (sh) params.set('showHidden', '1')
    params.set('t', String(Date.now()))
    fetch(`/api/patterns?${params}`, { cache: 'no-store' })
      .then(r => {
        if (!r.ok) throw new Error(`Server error ${r.status}`)
        return r.json()
      })
      .then(d => {
        const newIds = (d.findings || []).map((f: any) => f.id).join(',')
        if (isRefresh) {
          const unchanged = newIds === prevIdsRef.current
          setRefreshNote(unchanged ? 'ok' : null)
          if (unchanged) setTimeout(() => setRefreshNote(null), 3000)
        }
        prevIdsRef.current = newIds
        setFindings(d.findings || [])
        setStatuses(d.statuses || [])
        setGeneratedAt(d.generatedAt || null)
        setIsAdmin(d.isAdmin ?? false)
        setHiddenCount(d.hiddenCount ?? 0)
        setLoading(false)
        setRefreshing(false)
      })
      .catch(() => {
        setRefreshNote('error')
        setLoading(false)
        setRefreshing(false)
      })
  }

  useEffect(() => { doFetch(false, false) }, [])

  const allVisible = catFilter === 'all' ? findings : findings.filter(f => f.category === catFilter)
  const actionFindings = allVisible.filter(f => f.kind === 'action')
  const bgFindings     = allVisible.filter(f => f.kind === 'background')

  // Status lines: categories with no action findings in the current filter view
  const catsInView = catFilter === 'all'
    ? CAT_LABELS.filter(c => c.key !== 'all').map(c => c.key)
    : [catFilter]
  const statusLines = catsInView
    .map(cat => {
      const hasAction = findings.some(f => f.category === cat && f.kind === 'action')
      if (hasAction) return null
      return statuses.find(s => s.category === cat) ?? null
    })
    .filter((s): s is DetectorStatus => s !== null)

  const chipStyle = (active: boolean): React.CSSProperties => ({
    padding: '5px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600,
    border: `1px solid ${active ? 'var(--color-accent)' : 'var(--color-border)'}`,
    background: active ? 'var(--color-accent)' : 'var(--color-surface)',
    color: active ? '#fff' : 'var(--color-text-2)',
    cursor: 'pointer', whiteSpace: 'nowrap' as const,
  })

  const handleToggleShowHidden = () => {
    const next = !showHidden
    setShowHidden(next)
    doFetch(true, next)
  }

  return (
    <div style={SEC_STYLE}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <SectionHeader title="Patterns found" />
        <span style={{ fontSize: 11, color: 'var(--color-text-3)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {generatedAt && (
            <>
              Last checked {toTucsonTime(generatedAt)} ·{' '}
              <button
                onClick={() => doFetch(true, showHidden)}
                disabled={refreshing}
                style={{ background: 'none', border: 'none', padding: 0, fontSize: 11, color: 'var(--color-accent)', cursor: refreshing ? 'default' : 'pointer', fontWeight: 600 }}>
                {refreshing ? '↻ Refreshing…' : 'Refresh'}
              </button>
            </>
          )}
          {refreshNote === 'ok' && (
            <span style={{ color: '#15803d' }}>✓ Up to date</span>
          )}
          {refreshNote === 'error' && (
            <span style={{ color: '#c2410c' }}>Refresh failed — try again</span>
          )}
        </span>
      </div>

      {/* Filter chips */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
        {CAT_LABELS.map(c => (
          <button key={c.key} style={chipStyle(catFilter === c.key)} onClick={() => setCatFilter(c.key)}>
            {c.key !== 'all' && CAT_EMOJI[c.key] + ' '}
            {c.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p style={{ fontSize: 12, color: 'var(--color-text-3)' }}>Finding patterns…</p>
      ) : (
        <>
          {/* Action findings */}
          {actionFindings.length > 0
            ? actionFindings.map(f => <FindingCard key={f.id} f={f} isAdmin={isAdmin} onRefresh={() => doFetch(true, showHidden)} />)
            : <p style={{ fontSize: 12, color: 'var(--color-text-3)', padding: '10px 0' }}>
                No strong patterns yet — they'll appear as more data comes in.
              </p>
          }

          {/* Status lines for categories with no action findings */}
          {statusLines.length > 0 && (
            <div style={{ marginTop: actionFindings.length > 0 ? 8 : 0 }}>
              {statusLines.map(s => (
                <p key={s.category} style={{ fontSize: 11, color: 'var(--color-text-3)', margin: '3px 0' }}>
                  {CAT_EMOJI[s.category] || ''} {s.error
                    ? `Couldn't check ${s.category}: ${s.error}`
                    : `Checked ${s.checked} · nothing to act on yet.`}
                </p>
              ))}
            </div>
          )}

          {/* Hidden count */}
          {hiddenCount > 0 && (
            <p style={{ fontSize: 11, color: 'var(--color-text-3)', marginTop: 8, marginBottom: 0 }}>
              {hiddenCount} hidden ·{' '}
              <button onClick={handleToggleShowHidden} style={{ background: 'none', border: 'none', padding: 0, fontSize: 11, color: 'var(--color-accent)', cursor: 'pointer', fontWeight: 600 }}>
                {showHidden ? 'Unhide' : 'Show'}
              </button>
            </p>
          )}

          {/* Background findings (collapsed) */}
          {bgFindings.length > 0 && (
            <div style={{ marginTop: 14, borderTop: '1px solid var(--color-border)', paddingTop: 10 }}>
              <button
                onClick={() => setBgOpen(o => !o)}
                style={{
                  background: 'none', border: 'none', padding: '2px 0', fontSize: 12,
                  color: 'var(--color-text-2)', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6,
                }}>
                <span style={{ fontSize: 11 }}>{bgOpen ? '▾' : '▸'}</span>
                Background ({bgFindings.length})
              </button>
              {bgOpen && (
                <>
                  {bgFindings.map(f => <FindingCard key={f.id} f={f} isAdmin={isAdmin} onRefresh={() => doFetch(true, showHidden)} />)}
                  <p style={{ fontSize: 11, color: 'var(--color-text-3)', marginTop: 12, fontStyle: 'italic' }}>
                    Patterns are found with plain math from your data. They show what tends to happen together, not proof of cause.
                  </p>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── Ask section ─────────────────────────────────────────────────────────────

type AskNumbers = { label: string; value: string }
type AskTable   = { columns: string[]; rows: string[][] }
type AskChart   = { type: 'bar' | 'line'; title: string; labels: string[]; values: number[] }
type AskResult  = { answer: string; numbers?: AskNumbers[]; table?: AskTable; chart?: AskChart; cannotAnswer?: string; toolsUsed?: string[] }
type QA         = { q: string; result: AskResult }

const EXAMPLE_CHIPS = [
  'Which horses have the most Not a fit swaps?',
  'How many 220+ lb guests did we have in September?',
  'Who shod Buster last and when is he due?',
  'Which horses are idle right now?',
]

const TOOL_LABELS: Record<string, string> = {
  get_guests:        'Looked up guests (ages, weights, dates, horses)',
  get_assignments:   'Looked up horse assignments and swaps',
  get_horses:        'Looked up the horse roster',
  get_horse_activity:"Looked up a horse's history",
  get_shoe_visits:   'Looked up farrier visits',
  get_health_flags:  'Looked up health flags',
  get_patterns:      'Checked current patterns',
  get_weather:       'Looked up weather',
}

function SimpleChart({ chart }: { chart: AskChart }) {
  const max = Math.max(...chart.values, 1)
  if (chart.type === 'bar') {
    return (
      <div style={{ marginTop: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>{chart.title}</div>
        {chart.labels.map((label, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
            <div style={{ fontSize: 11, color: 'var(--color-text-3)', width: 90, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</div>
            <div style={{ flex: 1, background: 'var(--color-border)', borderRadius: 4, height: 12, position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${(chart.values[i] / max) * 100}%`, background: 'var(--color-accent)', borderRadius: 4, transition: 'width 0.4s ease' }} />
            </div>
            <div style={{ fontSize: 11, color: 'var(--color-text-2)', width: 28, textAlign: 'right', flexShrink: 0 }}>{chart.values[i]}</div>
          </div>
        ))}
      </div>
    )
  }
  // Line chart — SVG
  const W = 320, H = 72, PAD = 14
  const n = chart.values.length
  if (n < 2) return null
  const pts = chart.values.map((v, i) => [
    PAD + (i / (n - 1)) * (W - 2 * PAD),
    PAD + ((max - v) / max) * (H - 2 * PAD),
  ])
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>{chart.title}</div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: W, height: H, display: 'block' }}>
        <path d={d} fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeLinejoin="round" />
        {pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={3} fill="var(--color-accent)" />)}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 9, color: 'var(--color-text-3)' }}>{chart.labels[0]}</span>
        <span style={{ fontSize: 9, color: 'var(--color-text-3)' }}>{chart.labels[chart.labels.length - 1]}</span>
      </div>
    </div>
  )
}

function AskResultCard({ qa }: { qa: QA }) {
  const [toolsOpen, setToolsOpen] = useState(false)
  const r = qa.result
  return (
    <div style={{ marginTop: 10, padding: '12px 14px', background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
      <div style={{ fontSize: 11, color: 'var(--color-text-3)', marginBottom: 6, fontStyle: 'italic' }}>{qa.q}</div>
      {r.cannotAnswer && (
        <p style={{ fontSize: 12, color: 'var(--color-text-3)', marginBottom: 6 }}>{r.cannotAnswer}</p>
      )}
      <p style={{ fontSize: 13, color: 'var(--color-text)', margin: 0, marginBottom: r.numbers?.length || r.table || r.chart ? 8 : 0 }}>{r.answer}</p>
      {r.numbers && r.numbers.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: r.table || r.chart ? 8 : 0 }}>
          {r.numbers.map((n, i) => (
            <span key={i} style={{ padding: '2px 9px', borderRadius: 999, fontSize: 11, background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-2)' }}>
              <span style={{ color: 'var(--color-text-3)', fontWeight: 400 }}>{n.label}: </span>
              <span style={{ fontWeight: 600 }}>{n.value}</span>
            </span>
          ))}
        </div>
      )}
      {r.table && r.table.rows.length > 0 && (
        <div style={{ overflowX: 'auto', marginBottom: r.chart ? 8 : 0 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>{r.table.columns.map(c => (
                <th key={c} style={{ padding: '4px 8px', textAlign: 'left', fontWeight: 700, fontSize: 10, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid var(--color-border)', whiteSpace: 'nowrap' }}>{c}</th>
              ))}</tr>
            </thead>
            <tbody>
              {r.table.rows.slice(0, 15).map((row, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.02)' }}>
                  {row.map((cell, j) => <td key={j} style={{ padding: '4px 8px', color: 'var(--color-text)', borderBottom: '1px solid var(--color-border)', whiteSpace: 'nowrap' }}>{cell}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {r.chart && <SimpleChart chart={r.chart} />}
      {r.toolsUsed && r.toolsUsed.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <button onClick={() => setToolsOpen(o => !o)} style={{ background: 'none', border: 'none', padding: 0, fontSize: 11, color: 'var(--color-text-3)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span>{toolsOpen ? '▾' : '▸'}</span> How I found this
          </button>
          {toolsOpen && (
            <ul style={{ fontSize: 11, color: 'var(--color-text-3)', margin: '3px 0 0 8px', paddingLeft: 14, lineHeight: 1.6 }}>
              {r.toolsUsed.map(t => (
                <li key={t}>{TOOL_LABELS[t] || t.replace(/_/g, ' ')}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function AskSection() {
  const [input,       setInput]       = useState('')
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState<string | null>(null)
  const [history,     setHistory]     = useState<QA[]>([])
  const [showExamples,setShowExamples]= useState(false)
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null)

  const ask = async (question: string) => {
    if (!question.trim() || loading) return
    setLoading(true)
    setError(null)
    setInput('')
    setExpandedIdx(null)
    const histCtx = history.slice(0, 3).map(h => ({ q: h.q, a: h.result.answer }))
    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: question.trim(), history: histCtx }),
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error || 'Request failed')
      setHistory(prev => [{ q: question.trim(), result: data }, ...prev].slice(0, 5))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const latest = history[0] || null
  const older  = history.slice(1)

  return (
    <div style={{ padding: '8px 16px 6px', borderBottom: '1px solid var(--color-border)', background: 'var(--color-surface)', flexShrink: 0 }}>
      {/* Main ask card */}
      <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-bg)', overflow: 'hidden' }}>
        {/* Input row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px' }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); ask(input) } }}
            placeholder="Ask about your data…"
            style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 13, color: 'var(--color-text)', fontFamily: 'inherit', minWidth: 0 }}
          />
          <button
            onClick={() => setShowExamples(o => !o)}
            style={{ background: 'none', border: 'none', padding: '4px 6px', fontSize: 11, color: 'var(--color-text-3)', cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap' }}
          >
            Examples {showExamples ? '▴' : '▾'}
          </button>
          <button
            onClick={() => ask(input)}
            disabled={loading || !input.trim()}
            style={{ padding: '5px 14px', borderRadius: 'var(--radius-sm)', background: loading || !input.trim() ? 'var(--color-border)' : 'var(--color-accent)', color: loading || !input.trim() ? 'var(--color-text-3)' : '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: loading || !input.trim() ? 'default' : 'pointer', flexShrink: 0 }}
          >
            {loading ? '…' : 'Ask'}
          </button>
        </div>

        {/* Examples chips */}
        {showExamples && (
          <div style={{ padding: '4px 10px 8px', borderTop: '1px solid var(--color-border)', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {EXAMPLE_CHIPS.map(chip => (
              <button key={chip} onClick={() => { setShowExamples(false); ask(chip) }} style={{ padding: '3px 9px', borderRadius: 999, fontSize: 11, border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text-2)', cursor: 'pointer' }}>
                {chip}
              </button>
            ))}
          </div>
        )}

        {/* Status / latest answer */}
        {loading && (
          <div style={{ padding: '6px 12px 8px', borderTop: '1px solid var(--color-border)' }}>
            <p style={{ fontSize: 12, color: 'var(--color-text-3)', margin: 0 }}>Looking through your data…</p>
          </div>
        )}
        {error && !loading && (
          <div style={{ padding: '6px 12px 8px', borderTop: '1px solid var(--color-border)' }}>
            <p style={{ fontSize: 12, color: '#c2410c', margin: 0 }}>{error}</p>
          </div>
        )}
        {latest && !loading && (
          <div style={{ borderTop: '1px solid var(--color-border)', padding: '8px 12px' }}>
            <AskResultCard qa={latest} />
          </div>
        )}
      </div>

      {/* Older Q&As — collapsed accordion rows */}
      {older.length > 0 && (
        <div style={{ marginTop: 2 }}>
          {older.map((qa, i) => {
            const idx = i + 1
            const isOpen = expandedIdx === idx
            return (
              <div key={idx} style={{ borderBottom: i < older.length - 1 ? '1px solid var(--color-border)' : 'none' }}>
                <button
                  onClick={() => setExpandedIdx(isOpen ? null : idx)}
                  style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '5px 2px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--color-text-3)' }}
                >
                  <span style={{ flexShrink: 0 }}>↩</span>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{qa.q}</span>
                  <span style={{ flexShrink: 0, fontSize: 10 }}>{isOpen ? '▾' : '▸'}</span>
                </button>
                {isOpen && (
                  <div style={{ paddingLeft: 14, paddingBottom: 8 }}>
                    <AskResultCard qa={qa} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Clear */}
      {history.length > 0 && !loading && (
        <div style={{ textAlign: 'right', marginTop: 2 }}>
          <button
            onClick={() => { setHistory([]); setExpandedIdx(null); setError(null) }}
            style={{ background: 'none', border: 'none', padding: '2px 0', fontSize: 11, color: 'var(--color-text-3)', cursor: 'pointer' }}
          >
            Clear
          </button>
        </div>
      )}
    </div>
  )
}

// ─── CorrelationsView ─────────────────────────────────────────────────────────

function CorrelationsView({ guests, horses }: { guests: AnalyticsGuest[]; horses: DbHorse[] }) {
  const [matchWeight, setMatchWeight] = useState('')
  const [matchLevel, setMatchLevel]   = useState('')
  const [matchGender, setMatchGender] = useState('')

  // Only guests with assignments
  const gwa = guests.filter(g => (g.horse_assignments || []).length > 0)
  const activeHorseNames = new Set(horses.map(h => h.name))

  // ── Pre-compute per-horse stats ───────────────────────────────────────────

  type HorseStats = {
    name: string
    assignments: number
    incompatible: number
    genders: string[]
    levels: string[]
    weights: number[]
  }
  const horseMap: Record<string, HorseStats> = {}
  horses.forEach(h => {
    horseMap[h.name] = { name: h.name, assignments: 0, incompatible: 0, genders: [], levels: [], weights: [] }
  })
  gwa.forEach(g => {
    ;(g.horse_assignments || []).forEach(a => {
      if (!activeHorseNames.has(a.horse_name)) return
      if (!horseMap[a.horse_name]) return
      horseMap[a.horse_name].assignments++
      if (a.incompatible) horseMap[a.horse_name].incompatible++
      const gender = (g.gender || '').trim()
      if (gender) horseMap[a.horse_name].genders.push(gender.toLowerCase())
      if (g.riding_level) horseMap[a.horse_name].levels.push(g.riding_level)
      if (g.weight) horseMap[a.horse_name].weights.push(g.weight)
    })
  })
  const horseStats = Object.values(horseMap)

  // ── Section 1: Weight × Reassignment ──────────────────────────────────────

  type WtRow = {
    label: string
    total: number
    flags: number
    rate: number
    top3: { name: string; count: number }[]
  }
  const wtRows: WtRow[] = WEIGHT_BANDS.map(bk => {
    const horseAssignCounts: Record<string, number> = {}
    let total = 0, flags = 0
    gwa.forEach(g => {
      if (!g.weight || g.weight < bk.min || g.weight > bk.max) return
      ;(g.horse_assignments || []).forEach(a => {
        if (!activeHorseNames.has(a.horse_name)) return
        total++
        if (a.incompatible) flags++
        horseAssignCounts[a.horse_name] = (horseAssignCounts[a.horse_name] || 0) + 1
      })
    })
    const rate = total > 0 ? Math.round((flags / total) * 100) : 0
    const top3 = Object.entries(horseAssignCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([name, count]) => ({ name, count }))
    return { label: bk.label, total, flags, rate, top3 }
  })
  const maxWtRate = Math.max(...wtRows.map(r => r.rate), 1)

  // ── Section 2: Level × Success Rate ───────────────────────────────────────

  type LvlRow = {
    key: string; label: string
    total: number; flags: number; successPct: number
    top3: { name: string; count: number }[]
  }
  const lvlRows: LvlRow[] = LEVELS.map(key => {
    const horseAssignCounts: Record<string, number> = {}
    let total = 0, flags = 0
    gwa.forEach(g => {
      if (g.riding_level !== key) return
      ;(g.horse_assignments || []).forEach(a => {
        if (!activeHorseNames.has(a.horse_name)) return
        total++
        if (a.incompatible) flags++
        horseAssignCounts[a.horse_name] = (horseAssignCounts[a.horse_name] || 0) + 1
      })
    })
    const successPct = total > 0 ? Math.round(((total - flags) / total) * 100) : 0
    const top3 = Object.entries(horseAssignCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([name, count]) => ({ name, count }))
    return { key, label: LEVEL_LABELS[key] || key, total, flags, successPct, top3 }
  }).filter(r => r.total > 0)

  // ── Section 3: Gender × Horse Affinity ────────────────────────────────────

  const affinityHorses = horseStats
    .filter(h => h.assignments >= 10)
    .map(h => {
      const female = h.genders.filter(g => g === 'female').length
      const male   = h.genders.filter(g => g === 'male').length
      const total  = female + male
      const femalePct = total > 0 ? Math.round((female / total) * 100) : 0
      const malePct   = total > 0 ? Math.round((male   / total) * 100) : 0
      const tendency  = femalePct >= 80 ? 'Tends toward Female riders'
                      : malePct   >= 80 ? 'Tends toward Male riders'
                      : null
      return { name: h.name, femalePct, malePct, total, tendency }
    })
    .sort((a, b) => b.total - a.total)

  // ── Section 4: Best Match Finder ──────────────────────────────────────────

  const selectedBucket = WEIGHT_BANDS.find(b => b.label === matchWeight) || null
  const matchResults = (() => {
    if (!matchWeight && !matchLevel && !matchGender) return null
    const horseScore: Record<string, { total: number; success: number }> = {}
    gwa.forEach(g => {
      // Weight filter
      if (selectedBucket) {
        if (!g.weight || g.weight < selectedBucket.min || g.weight > selectedBucket.max) return
      }
      // Level filter
      if (matchLevel && g.riding_level !== matchLevel) return
      // Gender filter
      if (matchGender) {
        const gGender = (g.gender || '').toLowerCase()
        if (gGender !== matchGender.toLowerCase()) return
      }
      ;(g.horse_assignments || []).forEach(a => {
        if (!activeHorseNames.has(a.horse_name)) return
        if (!horseScore[a.horse_name]) horseScore[a.horse_name] = { total: 0, success: 0 }
        horseScore[a.horse_name].total++
        if (!a.incompatible) horseScore[a.horse_name].success++
      })
    })
    const totalAssignments = Object.values(horseScore).reduce((s, h) => s + h.total, 0)
    const top3 = Object.entries(horseScore)
      .map(([name, s]) => ({
        name,
        total: s.total,
        success: s.success,
        successPct: s.total > 0 ? Math.round((s.success / s.total) * 100) : 0,
      }))
      .sort((a, b) => b.success - a.success)
      .slice(0, 3)
    return { top3, totalAssignments }
  })()

  // ── Section 5: Guest Profile Shifts ───────────────────────────────────────

  const PROFILE_START = '2026-05-11'
  type WeekProfile = {
    label: string
    guests: number
    avgWeight: number | null
    mostLevel: string
    femalePct: number | null
    malePct: number | null
    avgAge: number | null
  }

  function getWeekLabel(date: string): string {
    const d = new Date(date + 'T12:00:00')
    const start = new Date(PROFILE_START + 'T12:00:00')
    const weekNum = Math.floor((d.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000))
    if (weekNum < 0) return ''
    const weekStart = new Date(start.getTime() + weekNum * 7 * 24 * 60 * 60 * 1000)
    return weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const weekBuckets: Record<string, AnalyticsGuest[]> = {}
  gwa.forEach(g => {
    const date = g.check_out_date || g.check_in_date
    if (!date || date < PROFILE_START) return
    const label = getWeekLabel(date)
    if (!label) return
    if (!weekBuckets[label]) weekBuckets[label] = []
    weekBuckets[label].push(g)
  })

  const weekProfiles: WeekProfile[] = Object.entries(weekBuckets)
    .sort(([a], [b]) => {
      const toDate = (s: string) => new Date(s + ' 2026')
      return toDate(a).getTime() - toDate(b).getTime()
    })
    .map(([label, wGuests]) => {
      const weights = wGuests.map(g => g.weight).filter((w): w is number => !!w)
      const ages    = wGuests.map(g => g.age).filter((a): a is number => !!a)
      const levels: Record<string, number> = {}
      wGuests.forEach(g => { if (g.riding_level) levels[g.riding_level] = (levels[g.riding_level] || 0) + 1 })
      const mostLevel = Object.entries(levels).sort(([, a], [, b]) => b - a)[0]?.[0] ?? '—'
      const female = wGuests.filter(g => (g.gender || '').toLowerCase() === 'female').length
      const male   = wGuests.filter(g => (g.gender || '').toLowerCase() === 'male').length
      const gTotal = female + male
      return {
        label,
        guests: wGuests.length,
        avgWeight: weights.length > 0 ? Math.round(weights.reduce((a, b) => a + b, 0) / weights.length) : null,
        mostLevel,
        femalePct: gTotal > 0 ? Math.round((female / gTotal) * 100) : null,
        malePct:   gTotal > 0 ? Math.round((male   / gTotal) * 100) : null,
        avgAge:    ages.length > 0 ? Math.round(ages.reduce((a, b) => a + b, 0) / ages.length) : null,
      }
    })

  // ── Render ────────────────────────────────────────────────────────────────

  if (gwa.length === 0) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: 'var(--color-text-3)', fontSize: 13 }}>
        No guest assignment data available yet.
      </div>
    )
  }

  const selectStyle: React.CSSProperties = {
    padding: '7px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)',
    background: 'var(--color-surface)', fontSize: 13, color: 'var(--color-text)', cursor: 'pointer',
    flex: 1, minWidth: 0,
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 48px' }}>
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, marginBottom: 14 }}>Correlations</h2>

      {/* ── Patterns found ── */}
      <PatternsSection />

      {/* ── 4. Best Match Finder ── */}
      <div style={SEC_STYLE}>
        <SectionHeader title="Best Match Finder" />
        <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
          <select value={matchWeight} onChange={e => setMatchWeight(e.target.value)} style={selectStyle}>
            <option value=''>Any weight</option>
            {WEIGHT_BANDS.map(b => <option key={b.label} value={b.label}>{b.label} lbs</option>)}
          </select>
          <select value={matchLevel} onChange={e => setMatchLevel(e.target.value)} style={selectStyle}>
            <option value=''>Any level</option>
            {LEVELS.map(l => <option key={l} value={l}>{LEVEL_LABELS[l]}</option>)}
          </select>
          <select value={matchGender} onChange={e => setMatchGender(e.target.value)} style={selectStyle}>
            <option value=''>Any gender</option>
            <option value='female'>Female</option>
            <option value='male'>Male</option>
          </select>
        </div>

        {!matchResults ? (
          <p style={{ fontSize: 12, color: 'var(--color-text-3)' }}>Select at least one filter above to find matches.</p>
        ) : matchResults.top3.length === 0 ? (
          <p style={{ fontSize: 12, color: 'var(--color-text-3)' }}>No data for this combination yet.</p>
        ) : (
          <>
            <p style={{ fontSize: 11, color: 'var(--color-text-3)', marginBottom: 10 }}>
              Based on {matchResults.totalAssignments} historical assignment{matchResults.totalAssignments !== 1 ? 's' : ''}
            </p>
            {matchResults.top3.map((h, i) => (
              <div key={h.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: i < matchResults.top3.length - 1 ? '1px solid var(--color-border)' : 'none' }}>
                <span style={{ fontSize: 16, color: 'var(--color-text-3)', width: 20, flexShrink: 0 }}>
                  {i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{h.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-3)', marginTop: 2 }}>
                    {h.total} assignment{h.total !== 1 ? 's' : ''} · {h.successPct}% success
                  </div>
                </div>
                <span style={{
                  padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700,
                  background: h.successPct >= 90 ? '#f0fdf4' : h.successPct >= 75 ? 'var(--color-bg)' : '#fff7ed',
                  color:      h.successPct >= 90 ? '#15803d' : h.successPct >= 75 ? 'var(--color-text-2)' : '#c2410c',
                  border: `1px solid ${h.successPct >= 90 ? '#86efac' : h.successPct >= 75 ? 'var(--color-border)' : '#fed7aa'}`,
                }}>
                  {h.success} ✓
                </span>
              </div>
            ))}
          </>
        )}
      </div>

      {/* ── 1. Weight × Reassignment ── */}
      <div style={SEC_STYLE}>
        <SectionHeader title="Weight × Reassignment Rate" />
        <p style={{ fontSize: 11, color: 'var(--color-text-3)', marginBottom: 12 }}>
          How often guests in each weight range receive a not a fit flag
        </p>
        {wtRows.map(row => (
          <div key={row.label} style={{ marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid var(--color-border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ fontWeight: 600, fontSize: 13, flex: 1 }}>{row.label} lbs</span>
              {row.total > 0 ? (
                <span style={{
                  padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700,
                  background: row.rate === maxWtRate && row.rate > 0 ? '#fff7ed' : 'var(--color-bg)',
                  color:      row.rate === maxWtRate && row.rate > 0 ? '#c2410c' : 'var(--color-text-2)',
                  border: `1px solid ${row.rate === maxWtRate && row.rate > 0 ? '#fed7aa' : 'var(--color-border)'}`,
                }}>
                  {row.rate}% reassigned
                </span>
              ) : (
                <span style={{ fontSize: 11, color: 'var(--color-text-3)' }}>No data</span>
              )}
            </div>
            {row.total > 0 && (
              <>
                <div style={{ fontSize: 11, color: 'var(--color-text-3)', marginBottom: 6 }}>
                  {row.total} assignments · {row.flags} flag{row.flags !== 1 ? 's' : ''}
                </div>
                {row.top3.length > 0 && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {row.top3.map(h => (
                      <span key={h.name} style={{ fontSize: 11, padding: '2px 7px', borderRadius: 999, background: 'var(--color-accent-bg)', color: 'var(--color-accent)', border: '1px solid var(--color-accent)', fontWeight: 500 }}>
                        {h.name} ({h.count})
                      </span>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        ))}
      </div>

      {/* ── 2. Level × Success Rate ── */}
      <div style={SEC_STYLE}>
        <SectionHeader title="Level × Success Rate" />
        {lvlRows.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--color-text-3)' }}>Not enough data yet.</p>
        ) : lvlRows.map(row => (
          <div key={row.key} style={{ marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid var(--color-border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
              <span style={{ fontWeight: 600, fontSize: 13, flex: 1 }}>{row.label}</span>
              <span style={{
                padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700,
                background: row.successPct >= 90 ? '#f0fdf4' : row.successPct >= 75 ? 'var(--color-bg)' : '#fff7ed',
                color:      row.successPct >= 90 ? '#15803d' : row.successPct >= 75 ? 'var(--color-text-2)' : '#c2410c',
                border: `1px solid ${row.successPct >= 90 ? '#86efac' : row.successPct >= 75 ? 'var(--color-border)' : '#fed7aa'}`,
              }}>
                {row.successPct}% success
              </span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--color-text-3)', marginBottom: 6 }}>
              {row.total} assignments · {row.flags} flag{row.flags !== 1 ? 's' : ''}
            </div>
            {row.top3.length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {row.top3.map(h => (
                  <span key={h.name} style={{ fontSize: 11, padding: '2px 7px', borderRadius: 999, background: 'var(--color-accent-bg)', color: 'var(--color-accent)', border: '1px solid var(--color-accent)', fontWeight: 500 }}>
                    {h.name} ({h.count})
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── 3. Gender × Horse Affinity ── */}
      <div style={SEC_STYLE}>
        <SectionHeader title="Gender × Horse Affinity" />
        <p style={{ fontSize: 11, color: 'var(--color-text-3)', marginBottom: 12 }}>
          Horses with 10+ assignments. Flagged when 80%+ from one gender.
        </p>
        {affinityHorses.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--color-text-3)' }}>No horses have 10+ assignments yet.</p>
        ) : affinityHorses.map(h => (
          <div key={h.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid var(--color-border)' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 3 }}>{h.name}</div>
              <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', background: 'var(--color-border)', marginBottom: 4 }}>
                <div style={{ width: `${h.femalePct}%`, background: '#f472b6' }} />
                <div style={{ width: `${h.malePct}%`,   background: '#60a5fa' }} />
              </div>
              <div style={{ fontSize: 11, color: 'var(--color-text-3)' }}>
                {h.femalePct}% F / {h.malePct}% M · {h.total} riders
              </div>
            </div>
            {h.tendency && (
              <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 999, background: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa', fontWeight: 600, flexShrink: 0, textAlign: 'right', maxWidth: 120 }}>
                {h.tendency}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* ── 5. Guest Profile Shifts ── */}
      <div style={SEC_STYLE}>
        <SectionHeader title="Guest Profile Shifts (Weekly)" />
        <p style={{ fontSize: 11, color: 'var(--color-text-3)', marginBottom: 12 }}>
          Weekly trends since May 11, 2026 based on checkout date
        </p>
        {weekProfiles.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--color-text-3)' }}>No data since May 11, 2026 yet.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  {['Week of', 'Guests', 'Avg Wt', 'Top Level', 'Gender', 'Avg Age'].map(h => (
                    <th key={h} style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 700, fontSize: 10, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid var(--color-border)', whiteSpace: 'nowrap' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {weekProfiles.map((w, i) => (
                  <tr key={w.label} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.02)' }}>
                    <td style={{ padding: '7px 8px', fontWeight: 600, color: 'var(--color-text-2)', whiteSpace: 'nowrap' }}>{w.label}</td>
                    <td style={{ padding: '7px 8px', color: 'var(--color-text)' }}>{w.guests}</td>
                    <td style={{ padding: '7px 8px', color: 'var(--color-text)' }}>{w.avgWeight != null ? `${w.avgWeight} lb` : '—'}</td>
                    <td style={{ padding: '7px 8px', color: 'var(--color-accent)', fontWeight: 600 }}>{LEVEL_LABELS[w.mostLevel] || w.mostLevel}</td>
                    <td style={{ padding: '7px 8px', color: 'var(--color-text-2)', whiteSpace: 'nowrap' }}>
                      {w.femalePct != null ? `${w.femalePct}%F / ${w.malePct}%M` : '—'}
                    </td>
                    <td style={{ padding: '7px 8px', color: 'var(--color-text)' }}>{w.avgAge != null ? `${w.avgAge} yr` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function InsightsPage() {
  const today = getTucsonToday()
  const [view, setView]       = useState<AnalyticsView>('correlations')
  const [guests, setGuests]   = useState<AnalyticsGuest[]>([])
  const [horses, setHorses]   = useState<DbHorse[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const tab = new URLSearchParams(window.location.search).get('tab')
    if (tab === 'shoes' || tab === 'guests' || tab === 'horses' || tab === 'correlations') {
      setView(tab as AnalyticsView)
    }
  }, [])

  useEffect(() => {
    Promise.all([
      fetch('/api/guests').then(r => r.json()),
      fetch('/api/horses').then(r => r.json()),
    ]).then(([gd, hd]) => {
      setGuests(gd.guests || gd || [])
      setHorses((hd.horses || []).filter((h: DbHorse) => h.is_active && !h.is_deceased))
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const gwa = guests.filter(g => (g.horse_assignments || []).length > 0)

  const tabBtn = (v: AnalyticsView, label: string) => (
    <button
      key={v}
      onClick={() => setView(v)}
      style={{
        padding: '7px 16px', borderRadius: 'var(--radius-md)',
        border: '1px solid var(--color-border)',
        background: view === v ? 'var(--color-accent)' : 'var(--color-surface)',
        color:      view === v ? '#fff'                 : 'var(--color-text-2)',
        fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
        transition: 'all 0.15s',
      }}
    >
      {label}
    </button>
  )

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--color-bg)' }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
        {/* Header: title left, tabs right */}
        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--color-surface)', flexShrink: 0, gap: 8, flexWrap: 'wrap' }}>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, margin: 0 }}>Insights</h1>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {tabBtn('correlations', 'Correlations')}
            {tabBtn('guests',       'Guests')}
            {tabBtn('horses',       'Horses')}
            {tabBtn('shoes',        'Shoes')}
          </div>
        </div>

        {/* Ask section */}
        <AskSection />

        {/* Content */}
        {loading ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <p style={{ color: 'var(--color-text-3)', fontSize: 13 }}>Loading insights…</p>
          </div>
        ) : view === 'guests' ? (
          <GuestAnalyticsPanel guests={gwa} allGuests={guests} today={today} />
        ) : view === 'horses' ? (
          <HorseAnalyticsPanel horses={horses} guests={guests} />
        ) : view === 'shoes' ? (
          <ShoeAnalyticsPanel />
        ) : (
          <CorrelationsView guests={guests} horses={horses} />
        )}
      </div>
    </div>
  )
}
