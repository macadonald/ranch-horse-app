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
  const [showResults, setShowResults] = useState(false)

  useEffect(() => {
    fetch('/api/rider-count')
      .then(r => r.json())
      .then(d => { if (d.count) { setRiderCount(d.count); setRiderCountInput(d.count.toString()) } })
      .catch(() => {})
  }, [])

  async function saveRiderCount() {
    if (!riderCountInput) return
    setSavingCount(true)
    try {
      const res = await fetch('/api/rider-count', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ count: parseInt(riderCountInput) }) })
      const data = await res.json()
      setRiderCount(data.count)
    } finally { setSavingCount(false) }
  }

  const exactMatches = matches.filter(m => m.fit === 'exact')
  const adjacentMatches = matches.filter(m => m.fit === 'adjacent')

  async function handleSubmit() {
    if (!age || !weight || !height || !level) { setError('Please fill in all fields and select a riding level.'); return }
    setError('')
    setLoading(true)
    setMatches([])
    setSelectedHorse(null)
    setDismissedHorses([])
    setShowResults(true)
    try {
      const res = await fetch('/api/match', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ age, weight, height, level, gender, notes, dismissedHorses: [] }) })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setMatches(data.matches)
      if (data.riderCount) setRiderCount(data.riderCount)
    } catch (err) {
      setError('Something went wrong. Please try again.')
      setShowResults(false)
    } finally { setLoading(false) }
  }

  async function dismissAndRefresh(horseName: string) {
    const newDismissed = [...dismissedHorses, horseName]
    setDismissedHorses(newDismissed)
    setMatches(prev => prev.filter(m => m.name !== horseName))
    try {
      const res = await fetch('/api/match', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ age, weight, height, level, gender, notes, dismissedHorses: newDismissed }) })
      const data = await res.json()
      if (data.matches) {
        const newMatch = data.matches.find((m: Match) => !newDismissed.includes(m.name) && !matches.find(e => e.name === m.name))
        if (newMatch) setMatches(prev => [...prev.filter(m => m.name !== horseName), newMatch])
      }
    } catch (err) { console.error(err) }
  }

  function handleReset() {
    setMatches([]); setSelectedHorse(null); setDismissedHorses([])
    setAge(''); setWeight(''); setHeight(''); setNotes(''); setLevel(''); setGender('')
    setError(''); setShowResults(false)
  }

  const doubleWarn = riderCount && riderCount >= 80
    ? riderCount >= 95 ? riderCount + ' riders — double assigning normal' : riderCount + ' riders — double assigning in mix'
    : null

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--color-bg)' }}>
      <Sidebar />
      <main style={{ flex: 1, overflowY: 'auto', minWidth: 0 }}>
        <div style={{ background: 'var(--color-surface)', borderBottom: '1px solid var(--color-border)', padding: '12px 16px 12px 60px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 10, flexWrap: 'wrap', gap: 8 }}>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700 }}>Horse Swap</h1>
          <div style={{ display: 'flex', gap: 7, alignItems: 'center', flexWrap: 'wrap' }}>
            {doubleWarn && <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 999, background: 'var(--color-warning-bg)', color: 'var(--color-warning)', border: '1px solid var(--color-warning-border)', fontWeight: 600 }}>{ '⚡ ' + doubleWarn}</span>}
            <input type="number" placeholder="Rider count" value={riderCountInput} onChange={e => setRiderCountInput(e.target.value)} style={{ width: 100, fontSize: 13 }} />
            <button onClick={saveRiderCount} disabled={savingCount} style={{ padding: '6px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-bg)', fontSize: 12, cursor: 'pointer', color: 'var(--color-text-2)' }}>{savingCount ? '...' : 'Set'}</button>
            {selectedHorse && <div style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'var(--color-success-bg)', border: '1px solid var(--color-success-border)', borderRadius: 'var(--radius-md)', padding: '5px 10px' }}>
              <span style={{ fontSize: 12, color: 'var(--color-success)', fontWeight: 600 }}>{'checkmark ' + selectedHorse}</span>
              <button onClick={handleReset} style={{ fontSize: 11, color: 'var(--color-text-3)', background: 'none', border: 'none', cursor: 'pointer' }}>New rider</button>
            </div>}
          </div>
        </div>

        <div style={{ padding: 16, display: 'grid', gridTemplateColumns: '320px 1fr', gap: 20, maxWidth: 1050 }} className="swap-layout">
          <div className={showResults ? 'hide-mobile' : ''}>
            <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 18 }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, marginBottom: 14, paddingBottom: 12, borderBottom: '1px solid var(--color-border)' }}>Rider Details</h2>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                <div><label>Age</label><input type="number" placeholder="e.g. 42" value={age} onChange={e => setAge(e.target.value)} /></div>
                <div><label>Weight (lbs)</label><input type="number" placeholder="e.g. 175" value={weight} onChange={e => setWeight(e.target.value)} /></div>
                <div style={{ gridColumn: '1/-1' }}><label>Height</label><input type="text" placeholder="e.g. 5'9" value={height} onChange={e => setHeight(e.target.value)} /></div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <label>Gender</label>
                <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                  {['Male', 'Female'].map(g => (
                    <button key={g} onClick={() => setGender(gender === g ? '' : g)} style={{ flex: 1, padding: '9px', borderRadius: 'var(--radius-sm)', border: gender === g ? '1.5px solid var(--color-accent)' : '1px solid var(--color-border)', background: gender === g ? 'var(--color-accent-bg)' : 'var(--color-surface)', color: gender === g ? 'var(--color-accent)' : 'var(--color-text-2)', fontSize: 14, fontWeight: gender === g ? 600 : 400, cursor: 'pointer' }}>{g}</button>
                  ))}
                </div>
              </div>
              <div style={{ marginBottom: 14 }}>
                <label>Notes</label>
                <textarea rows={3} placeholder="Nervous, bad back, wants smooth horse..." value={notes} onChange={e => setNotes(e.target.value)} style={{ resize: 'vertical', minHeight: 60 }} />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label>Riding Level</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
                  {LEVELS.map(l => (
                    <button key={l.key} onClick={() => setLevel(l.key)} style={{ padding: '11px 13px', borderRadius: 'var(--radius-sm)', border: level === l.key ? '1.5px solid var(--color-accent)' : '1px solid var(--color-border)', background: level === l.key ? 'var(--color-accent-bg)' : 'var(--color-surface)', color: level === l.key ? 'var(--color-accent)' : 'var(--color-text-2)', fontSize: 14, fontWeight: level === l.key ? 600 : 400, textAlign: 'left', cursor: 'pointer' }}>
                      {l.label}
                    </button>
                  ))}
                </div>
              </div>
              {error && <p style={{ fontSize: 13, color: 'var(--color-danger)', marginBottom: 10, padding: '8px 10px', background: 'var(--color-danger-bg)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-danger-border)' }}>{error}</p>}
              <button onClick={handleSubmit} disabled={loading} style={{ width: '100%', padding: '13px', borderRadius: 'var(--radius-md)', border: 'none', background: loading ? '#c4a47a' : 'var(--color-accent)', color: '#fff', fontSize: 15, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer' }}>
                {loading ? 'Scanning the herd...' : 'Find Matching Horses'}
              </button>
            </div>
          </div>

          <div>
            {showResults && (
              <button onClick={() => setShowResults(false)} className="show-mobile" style={{ display: 'none', marginBottom: 12, padding: '11px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-surface)', fontSize: 14, cursor: 'pointer', color: 'var(--color-text-2)', width: '100%', fontWeight: 500 }}>
                Back to rider details
              </button>
            )}

            {loading && <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{[1,2,3,4,5].map(i => <div key={i} style={{ height: 90, borderRadius: 'var(--radius-lg)' }} className="skeleton" />)}</div>}

            {!loading && matches.length === 0 && !showResults && (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--color-text-3)' }} className="hide-mobile">
                <div style={{ fontSize: 40, marginBottom: 12 }}>🐴</div>
                <p style={{ fontSize: 15, fontFamily: 'var(--font-display)' }}>Enter rider details to find matches</p>
                <p style={{ fontSize: 12, marginTop: 6, color: 'var(--color-text-muted)' }}>Results ranked best to worst with availability</p>
              </div>
            )}

            {!loading && matches.length > 0 && (
              <div>
                {exactMatches.length > 0 && <>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Exact level matches</div>
                  {exactMatches.map((m, i) => <MatchCard key={m.name} match={m} rank={i + 1} selected={selectedHorse === m.name} disabled={selectedHorse !== null && selectedHorse !== m.name} onSelect={() => setSelectedHorse(m.name)} onDismiss={() => dismissAndRefresh(m.name)} />)}
                </>}
                {adjacentMatches.length > 0 && <>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8, marginTop: exactMatches.length > 0 ? 20 : 0 }}>Adjacent level alternatives</div>
                  {adjacentMatches.map((m, i) => <MatchCard key={m.name} match={m} rank={exactMatches.length + i + 1} selected={selectedHorse === m.name} disabled={selectedHorse !== null && selectedHorse !== m.name} onSelect={() => setSelectedHorse(m.name)} onDismiss={() => dismissAndRefresh(m.name)} adjacent />)}
                </>}
              </div>
            )}
          </div>
        </div>

        <style>{`
          @media (max-width: 768px) {
            .swap-layout { grid-template-columns: 1fr !important; padding: 12px !important; }
            .hide-mobile { display: none !important; }
            .show-mobile { display: block !important; }
          }
        `}</style>
      </main>
    </div>
  )
}

function MatchCard({ match, rank, selected, disabled, adjacent, onSelect, onDismiss }: {
  match: Match; rank: number; selected: boolean; disabled: boolean; adjacent?: boolean; onSelect: () => void; onDismiss: () => void
}) {
  const isDouble = match.availability === 'double_assigned'
  const isCheckout = match.availability === 'checking_out_soon' || (match.warning || '').toLowerCase().includes('checking out soon')
  const isSingle = match.availability === 'single_assigned'

  return (
    <div style={{ background: selected ? 'var(--color-success-bg)' : disabled ? '#fafaf8' : isDouble ? 'var(--color-warning-bg)' : 'var(--color-surface)', border: selected ? '2px solid var(--color-success-border)' : isDouble ? '2px solid var(--color-warning-border)' : '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: '14px', marginBottom: 10, opacity: disabled ? 0.45 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <span style={{ fontSize: 22 }}>🐴</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: selected ? 'var(--color-success)' : isDouble ? '#92400e' : 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
            {match.name}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
          <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 999, fontWeight: 600, background: 'var(--color-info-bg)', color: 'var(--color-info)', border: '1px solid var(--color-info-border)' }}>{'#' + rank}</span>
          {!selected && !disabled && (
            <button onClick={e => { e.stopPropagation(); onDismiss() }} style={{ fontSize: 15, width: 30, height: 30, borderRadius: '50%', border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text-3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
        <span style={{ fontSize: 12, padding: '3px 9px', borderRadius: 999, fontWeight: 600, background: adjacent ? 'var(--color-warning-bg)' : 'var(--color-success-bg)', color: adjacent ? 'var(--color-warning)' : 'var(--color-success)', border: '1px solid ' + (adjacent ? 'var(--color-warning-border)' : 'var(--color-success-border)') }}>
          {adjacent ? 'Adjacent level' : 'Exact level'}
        </span>
        {isDouble && <span style={{ fontSize: 12, padding: '3px 9px', borderRadius: 999, fontWeight: 700, background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d' }}>Double assigned</span>}
        {isSingle && <span style={{ fontSize: 12, padding: '3px 9px', borderRadius: 999, fontWeight: 600, background: 'var(--color-info-bg)', color: 'var(--color-info)', border: '1px solid var(--color-info-border)' }}>Already assigned</span>}
        {isCheckout && <span style={{ fontSize: 12, padding: '3px 9px', borderRadius: 999, fontWeight: 600, background: 'var(--color-success-bg)', color: 'var(--color-success)', border: '1px solid var(--color-success-border)' }}>Available soon</span>}
        {selected && <span style={{ fontSize: 12, padding: '3px 9px', borderRadius: 999, fontWeight: 600, background: 'var(--color-success-bg)', color: 'var(--color-success)', border: '1px solid var(--color-success-border)' }}>Assigned</span>}
      </div>

      <p style={{ fontSize: 13, color: 'var(--color-text-2)', lineHeight: 1.6, borderTop: '1px solid var(--color-border)', paddingTop: 10, marginBottom: match.warning ? 10 : 0 }}>{match.reason}</p>

      {match.warning && (
        <div style={{ fontSize: 13, color: 'var(--color-warning)', background: 'var(--color-warning-bg)', border: '1px solid var(--color-warning-border)', borderRadius: 'var(--radius-sm)', padding: '8px 10px', marginTop: 8 }}>
          {'warning ' + match.warning}
        </div>
      )}

      {!selected && !disabled && (
        <button onClick={onSelect} style={{ marginTop: 12, width: '100%', padding: '12px', borderRadius: 'var(--radius-sm)', border: 'none', background: 'var(--color-accent)', color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>
          Assign this horse
        </button>
      )}
    </div>
  )
}
