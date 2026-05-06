'use client'
import { useState, useEffect } from 'react'
import Sidebar from '@/components/Sidebar'

const LEVELS = [
  { key: 'B',  label: 'Beginner' },
  { key: 'AB', label: 'Adv Beginner' },
  { key: 'I',  label: 'Intermediate' },
  { key: 'AI', label: 'Adv Intermediate' },
  { key: 'A',  label: 'Advanced' },
]

interface Match {
  name: string
  fit: 'exact' | 'adjacent'
  reason: string
  warning?: string
  availability?: string
}

export default function SwapPage() {
  const [age, setAge] = useState('')
  const [weight, setWeight] = useState('')
  const [height, setHeight] = useState('')
  const [notes, setNotes] = useState('')
  const [level, setLevel] = useState('')
  const [gender, setGender] = useState('')
  const [loading, setLoading] = useState(false)
  const [matches, setMatches] = useState<Match[]>([])
  const [selectedHorse, setSelectedHorse] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [dismissedHorses, setDismissedHorses] = useState<string[]>([])
  const [riderCount, setRiderCount] = useState<number | null>(null)
  const [riderCountInput, setRiderCountInput] = useState('')
  const [savingCount, setSavingCount] = useState(false)

  useEffect(() => {
    fetch('/api/rider-count')
      .then(r => r.json())
      .then(d => {
        if (d.count) {
          setRiderCount(d.count)
          setRiderCountInput(d.count.toString())
        }
      })
      .catch(() => {})
  }, [])

  async function saveRiderCount() {
    if (!riderCountInput) return
    setSavingCount(true)
    try {
      const res = await fetch('/api/rider-count', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: parseInt(riderCountInput) }),
      })
      const data = await res.json()
      setRiderCount(data.count)
    } finally {
      setSavingCount(false)
    }
  }

  const exactMatches = matches.filter(m => m.fit === 'exact')
  const adjacentMatches = matches.filter(m => m.fit === 'adjacent')

  async function handleSubmit() {
    if (!age || !weight || !height || !level) {
      setError('Please fill in all fields and select a riding level.')
      return
    }
    setError('')
    setLoading(true)
    setMatches([])
    setSelectedHorse(null)
    setDismissedHorses([])

    try {
      const res = await fetch('/api/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ age, weight, height, level, gender, notes, dismissedHorses: [] }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setMatches(data.matches)
      if (data.riderCount) setRiderCount(data.riderCount)
    } catch (err) {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function dismissAndRefresh(horseName: string) {
    const newDismissed = [...dismissedHorses, horseName]
    setDismissedHorses(newDismissed)
    setMatches(prev => prev.filter(m => m.name !== horseName))

    try {
      const res = await fetch('/api/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ age, weight, height, level, gender, notes, dismissedHorses: newDismissed }),
      })
      const data = await res.json()
      if (data.matches) {
        const newMatch = data.matches.find((m: Match) => !newDismissed.includes(m.name) && !matches.find(existing => existing.name === m.name))
        if (newMatch) setMatches(prev => [...prev.filter(m => m.name !== horseName), newMatch])
      }
    } catch (err) {
      console.error('Refresh error:', err)
    }
  }

  function handleReset() {
    setMatches([])
    setSelectedHorse(null)
    setDismissedHorses([])
    setAge('')
    setWeight('')
    setHeight('')
    setNotes('')
    setLevel('')
    setError('')
  }

  const doubleAssignWarning = riderCount && riderCount >= 80
    ? riderCount >= 95
      ? `${riderCount} riders today — double assigning normal`
      : `${riderCount} riders today — double assigning in mix`
    : null

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--color-bg)' }}>
      <Sidebar />
      <main style={{ flex: 1, overflowY: 'auto', minWidth: 0 }}>
        <div style={{ background: 'var(--color-surface)', borderBottom: '1px solid var(--color-border)', padding: '16px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 10, flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700 }}>Horse Swap</h1>
            <p style={{ fontSize: 12, color: 'var(--color-text-3)', marginTop: 2 }}>Quick in-the-moment horse assignment</p>
          </div>
          <div style={{ display: 'flex',  gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {doubleAssignWarning && (
              <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 999, background: 'var(--color-warning-bg)', color: 'var(--color-warning)', border: '1px solid var(--color-warning-border)', fontWeight: 600 }}>
                ⚡ {doubleAssignWarning}
              </span>
            )}
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                type="number"
                placeholder="Today's rider count"
                value={riderCountInput}
                onChange={e => setRiderCountInput(e.target.value)}
                style={{ width: 150, fontSize: 13 }}
              />
              <button onClick={saveRiderCount} disabled={savingCount} style={{ padding: '7px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-bg)', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap', color: 'var(--color-text-2)' }}>
                {savingCount ? 'Saving...' : 'Set count'}
              </button>
            </div>
            {selectedHorse && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--color-success-bg)', border: '1px solid var(--color-success-border)', borderRadius: 'var(--radius-md)', padding: '6px 12px' }}>
                <span style={{ fontSize: 12, color: 'var(--color-success)', fontWeight: 600 }}>✓ {selectedHorse}</span>
                <button onClick={handleReset} style={{ fontSize: 11, color: 'var(--color-text-3)', background: 'none', border: 'none', cursor: 'pointer' }}>New rider</button>
              </div>
            )}
          </div>
        </div>

        <div style={{ padding: 28, display: 'grid', gridTemplateColumns: '360px 1fr', gap: 22, maxWidth: 1050 }}>
          <div>
            <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 22, position: 'sticky', top: 80 }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, marginBottom: 18, paddingBottom: 13, borderBottom: '1px solid var(--color-border)' }}>Rider Details</h2>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 13, marginBottom: 13 }}>
                <div><label>Age</label><input type="number" placeholder="e.g. 42" value={age} onChange={e => setAge(e.target.value)} min={3} max={99} /></div>
                <div><label>Weight (lbs)</label><input type="number" placeholder="e.g. 175" value={weight} onChange={e => setWeight(e.target.value)} min={40} max={400} /></div>
                <div><label>Height</label><input type="text" placeholder={`e.g. 5'9"`} value={height} onChange={e => setHeight(e.target.value)} /></div>
              </div>

              <div style={{ marginBottom: 18 }}>
                <label>Notes</label>
                <textarea rows={3} placeholder="Nervous, bad back, wants smooth horse, recent wreck, first time in years..." value={notes} onChange={e => setNotes(e.target.value)} style={{ resize: 'vertical', minHeight: 68 }} />
              </div>

              <div style={{ marginBottom: 20 }}>
                <label>Riding Level</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
                  {LEVELS.map(l => (
                    <button key={l.key} onClick={() => setLevel(l.key)} style={{ padding: '9px 13px', borderRadius: 'var(--radius-sm)', border: level === l.key ? '1.5px solid var(--color-accent)' : '1px solid var(--color-border)', background: level === l.key ? 'var(--color-accent-bg)' : 'var(--color-surface)', color: level === l.key ? 'var(--color-accent)' : 'var(--color-text-2)', fontSize: 13, fontWeight: level === l.key ? 600 : 400, textAlign: 'left', cursor: 'pointer' }}>
                      {l.label}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: 20 }}>
                <label>Gender</label>
                <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                  {['Male', 'Female'].map(g => (
                    <button key={g} onClick={() => setGender(g === gender ? '' : g)} style={{ flex: 1, padding: '9px 13px', borderRadius: 'var(--radius-sm)', border: gender === g ? '1.5px solid var(--color-accent)' : '1px solid var(--color-border)', background: gender === g ? 'var(--color-accent-bg)' : 'var(--color-surface)', color: gender === g ? 'var(--color-accent)' : 'var(--color-text-2)', fontSize: 13, fontWeight: gender === g ? 600 : 400, cursor: 'pointer' }}>{g}</button>
                  ))}
                </div>
              </div>
              {error && <p style={{ fontSize: 12, color: 'var(--color-danger)', marginBottom: 11, padding: '7px 11px', background: 'var(--color-danger-bg)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-danger-border)' }}>{error}</p>}

              <button onClick={handleSubmit} disabled={loading} style={{ width: '100%', padding: '11px 15px', borderRadius: 'var(--radius-md)', border: 'none', background: loading ? '#c4a47a' : 'var(--color-accent)', color: '#fff', fontSize: 14, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer' }}>
                {loading ? 'Scanning the herd...' : 'Find Matching Horses →'}
              </button>
            </div>
          </div>

          <div>
            {loading && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                {[1,2,3,4,5].map(i => <div key={i} style={{ height: 95, borderRadius: 'var(--radius-lg)' }} className="skeleton" />)}
              </div>
            )}

            {!loading && matches.length === 0 && (
              <div style={{ textAlign: 'center', padding: '56px 22px', color: 'var(--color-text-3)' }}>
                <div style={{ fontSize: 38, marginBottom: 11 }}>🐴</div>
                <p style={{ fontSize: 15, fontFamily: 'var(--font-display)' }}>Enter rider details to find matches</p>
                <p style={{ fontSize: 12, marginTop: 5, color: 'var(--color-text-muted)' }}>Results ranked best to worst with availability info</p>
              </div>
            )}

            {!loading && matches.length > 0 && (
              <div>
                {exactMatches.length > 0 && (
                  <>
                    <SectionLabel>Exact level matches</SectionLabel>
                    {exactMatches.map((m, i) => <MatchCard key={m.name} match={m} rank={i + 1} selected={selectedHorse === m.name} disabled={selectedHorse !== null && selectedHorse !== m.name} onSelect={() => setSelectedHorse(m.name)} onDismiss={() => dismissAndRefresh(m.name)} />)}
                  </>
                )}
                {adjacentMatches.length > 0 && (
                  <>
                    <SectionLabel style={{ marginTop: exactMatches.length > 0 ? 22 : 0 }}>Adjacent level — alternatives</SectionLabel>
                    {adjacentMatches.map((m, i) => <MatchCard key={m.name} match={m} rank={exactMatches.length + i + 1} selected={selectedHorse === m.name} disabled={selectedHorse !== null && selectedHorse !== m.name} onSelect={() => setSelectedHorse(m.name)} onDismiss={() => dismissAndRefresh(m.name)} adjacent />)}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}

function SectionLabel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 9, ...style }}>{children}</div>
}

function MatchCard({ match, rank, selected, disabled, adjacent, onSelect, onDismiss }: {
  match: Match; rank: number; selected: boolean; disabled: boolean; adjacent?: boolean; onSelect: () => void; onDismiss: () => void
}) {
  const isDouble = match.availability === 'double_assigned'
  const isCheckout = match.availability === 'checking_out_soon'
  const isSingle = match.availability === 'single_assigned'

  return (
    <div style={{ background: selected ? 'var(--color-success-bg)' : disabled ? '#fafaf8' : isDouble ? 'var(--color-warning-bg)' : 'var(--color-surface)', border: selected ? '1.5px solid var(--color-success-border)' : isDouble ? '1px solid var(--color-warning-border)' : adjacent ? '1px solid var(--color-warning-border)' : '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: '14px 16px', marginBottom: 9, opacity: disabled ? 0.45 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11, marginBottom: 9 }}>
        <div style={{ width: 36, height: 36, borderRadius: '50%', background: adjacent ? 'var(--color-warning-bg)' : 'var(--color-accent-bg)', border: `1px solid ${adjacent ? 'var(--color-warning-border)' : 'var(--color-accent-border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>🐴</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: selected ? 'var(--color-success)' : 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
            {selected && '✓ '}{match.name}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 999, fontWeight: 600, background: 'var(--color-info-bg)', color: 'var(--color-info)', border: '1px solid var(--color-info-border)' }}>#{rank}</span>
          <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 999, fontWeight: 600, background: adjacent ? 'var(--color-warning-bg)' : 'var(--color-success-bg)', color: adjacent ? 'var(--color-warning)' : 'var(--color-success)', border: `1px solid ${adjacent ? 'var(--color-warning-border)' : 'var(--color-success-border)'}` }}>
            {adjacent ? 'Adjacent' : 'Exact'}
          </span>
          {isDouble && <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 999, fontWeight: 600, background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d' }}>⚠ Double assigned</span>}
          {isSingle && <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 999, fontWeight: 600, background: 'var(--color-info-bg)', color: 'var(--color-info)' }}>Assigned</span>}
          {isCheckout && <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 999, fontWeight: 600, background: 'var(--color-success-bg)', color: 'var(--color-success)' }}>Avail soon</span>}
          {!selected && !disabled && (
            <button onClick={e => { e.stopPropagation(); onDismiss() }} style={{ fontSize: 13, width: 24, height: 24, borderRadius: '50%', border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text-3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>✕</button>
          )}
        </div>
      </div>

      <p style={{ fontSize: 12, color: 'var(--color-text-2)', lineHeight: 1.6, borderTop: '1px solid var(--color-border)', paddingTop: 9, marginBottom: match.warning ? 8 : 0 }}>{match.reason}</p>

      {match.warning && <p style={{ fontSize: 11, color: 'var(--color-warning)', background: 'var(--color-warning-bg)', border: '1px solid var(--color-warning-border)', borderRadius: 'var(--radius-sm)', padding: '5px 9px', marginTop: 6 }}>⚠ {match.warning}</p>}

      {!selected && !disabled && (
        <button onClick={onSelect} style={{ marginTop: 10, width: '100%', padding: '7px 12px', borderRadius: 'var(--radius-sm)', border: 'none', background: 'var(--color-accent)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
          Assign this horse →
        </button>
      )}
    </div>
  )
}
