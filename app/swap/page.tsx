'use client'
import { useState } from 'react'
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
}

export default function SwapPage() {
  const [age, setAge] = useState('')
  const [weight, setWeight] = useState('')
  const [height, setHeight] = useState('')
  const [notes, setNotes] = useState('')
  const [level, setLevel] = useState('')
  const [loading, setLoading] = useState(false)
  const [matches, setMatches] = useState<Match[]>([])
  const [selectedHorse, setSelectedHorse] = useState<string | null>(null)
  const [error, setError] = useState('')

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

    try {
      const res = await fetch('/api/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ age, weight, height, level, notes }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setMatches(data.matches)
    } catch (err) {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  function handleSelect(name: string) {
    setSelectedHorse(name)
  }

  function handleReset() {
    setMatches([])
    setSelectedHorse(null)
    setAge('')
    setWeight('')
    setHeight('')
    setNotes('')
    setLevel('')
    setError('')
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar />

      <main style={{
        flex: 1,
        overflowY: 'auto',
        background: 'var(--color-bg)',
      }}>
        {/* Top bar */}
        <div style={{
          background: 'var(--color-surface)',
          borderBottom: '1px solid var(--color-border)',
          padding: '16px 32px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          position: 'sticky',
          top: 0,
          zIndex: 10,
        }}>
          <div>
            <h1 style={{
              fontFamily: 'var(--font-display)',
              fontSize: 22,
              fontWeight: 700,
              color: 'var(--color-text)',
            }}>Horse Swap</h1>
            <p style={{ fontSize: 13, color: 'var(--color-text-3)', marginTop: 2 }}>
              Find the best horse match for a rider
            </p>
          </div>
          {selectedHorse && (
            <div style={{
              background: 'var(--color-success-bg)',
              border: '1px solid var(--color-success-border)',
              borderRadius: 'var(--radius-md)',
              padding: '8px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}>
              <span style={{ fontSize: 13, color: 'var(--color-success)', fontWeight: 600 }}>
                ✓ Assigned: {selectedHorse}
              </span>
              <button
                onClick={handleReset}
                style={{
                  fontSize: 12,
                  color: 'var(--color-text-3)',
                  background: 'none',
                  border: 'none',
                  padding: '2px 6px',
                  borderRadius: 4,
                  cursor: 'pointer',
                }}
              >
                New rider
              </button>
            </div>
          )}
        </div>

        <div style={{
          padding: 32,
          display: 'grid',
          gridTemplateColumns: '380px 1fr',
          gap: 24,
          maxWidth: 1100,
        }}>

          {/* Left — Intake Form */}
          <div>
            <div style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-lg)',
              padding: '24px',
              position: 'sticky',
              top: 88,
            }}>
              <h2 style={{
                fontFamily: 'var(--font-display)',
                fontSize: 16,
                fontWeight: 700,
                color: 'var(--color-text)',
                marginBottom: 20,
                paddingBottom: 14,
                borderBottom: '1px solid var(--color-border)',
              }}>Rider Details</h2>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                <div>
                  <label>Age</label>
                  <input
                    type="number"
                    placeholder="e.g. 42"
                    value={age}
                    onChange={e => setAge(e.target.value)}
                    min={3} max={99}
                  />
                </div>
                <div>
                  <label>Weight (lbs)</label>
                  <input
                    type="number"
                    placeholder="e.g. 175"
                    value={weight}
                    onChange={e => setWeight(e.target.value)}
                    min={40} max={400}
                  />
                </div>
                <div>
                  <label>Height</label>
                  <input
                    type="text"
                    placeholder={`e.g. 5'9"`}
                    value={height}
                    onChange={e => setHeight(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ marginBottom: 18 }}>
                <label>Notes</label>
                <textarea
                  rows={3}
                  placeholder="e.g. nervous rider, bad back, wants a smooth horse, recent wreck, first time riding in years..."
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  style={{ resize: 'vertical', minHeight: 72 }}
                />
              </div>

              <div style={{ marginBottom: 20 }}>
                <label>Riding Level</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
                  {LEVELS.map(l => (
                    <button
                      key={l.key}
                      onClick={() => setLevel(l.key)}
                      style={{
                        padding: '10px 14px',
                        borderRadius: 'var(--radius-sm)',
                        border: level === l.key
                          ? '1.5px solid var(--color-accent)'
                          : '1px solid var(--color-border)',
                        background: level === l.key
                          ? 'var(--color-accent-bg)'
                          : 'var(--color-surface)',
                        color: level === l.key
                          ? 'var(--color-accent)'
                          : 'var(--color-text-2)',
                        fontSize: 13,
                        fontWeight: level === l.key ? 600 : 400,
                        textAlign: 'left',
                        width: '100%',
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                      }}
                    >
                      {l.label}
                    </button>
                  ))}
                </div>
              </div>

              {error && (
                <p style={{
                  fontSize: 13,
                  color: 'var(--color-danger)',
                  marginBottom: 12,
                  padding: '8px 12px',
                  background: 'var(--color-danger-bg)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--color-danger-border)',
                }}>{error}</p>
              )}

              <button
                onClick={handleSubmit}
                disabled={loading}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  borderRadius: 'var(--radius-md)',
                  border: 'none',
                  background: loading ? '#c4a47a' : 'var(--color-accent)',
                  color: '#fff',
                  fontSize: 14,
                  fontWeight: 600,
                  letterSpacing: '0.02em',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {loading ? 'Scanning the herd...' : 'Find Matching Horses →'}
              </button>
            </div>
          </div>

          {/* Right — Results */}
          <div>
            {loading && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[1,2,3,4,5].map(i => (
                  <div key={i} style={{
                    height: 100,
                    borderRadius: 'var(--radius-lg)',
                    animationDelay: `${i * 0.1}s`,
                  }} className="skeleton animate-in" />
                ))}
              </div>
            )}

            {!loading && matches.length === 0 && (
              <div style={{
                textAlign: 'center',
                padding: '60px 24px',
                color: 'var(--color-text-3)',
              }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>🐴</div>
                <p style={{ fontSize: 15, fontFamily: 'var(--font-display)' }}>
                  Enter rider details to find matches
                </p>
                <p style={{ fontSize: 13, marginTop: 6, color: 'var(--color-text-muted)' }}>
                  Results will appear here ranked best to worst
                </p>
              </div>
            )}

            {!loading && matches.length > 0 && (
              <div className="animate-in">
                {exactMatches.length > 0 && (
                  <>
                    <SectionLabel>Exact level matches</SectionLabel>
                    {exactMatches.map((m, i) => (
                      <MatchCard
                        key={m.name}
                        match={m}
                        rank={i + 1}
                        selected={selectedHorse === m.name}
                        disabled={selectedHorse !== null && selectedHorse !== m.name}
                        onSelect={() => handleSelect(m.name)}
                      />
                    ))}
                  </>
                )}
                {adjacentMatches.length > 0 && (
                  <>
                    <SectionLabel style={{ marginTop: exactMatches.length > 0 ? 24 : 0 }}>
                      Adjacent level — best available alternatives
                    </SectionLabel>
                    {adjacentMatches.map((m, i) => (
                      <MatchCard
                        key={m.name}
                        match={m}
                        rank={exactMatches.length + i + 1}
                        selected={selectedHorse === m.name}
                        disabled={selectedHorse !== null && selectedHorse !== m.name}
                        onSelect={() => handleSelect(m.name)}
                        adjacent
                      />
                    ))}
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
  return (
    <div style={{
      fontSize: 11,
      fontWeight: 600,
      color: 'var(--color-text-muted)',
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
      marginBottom: 10,
      ...style,
    }}>
      {children}
    </div>
  )
}

function MatchCard({
  match,
  rank,
  selected,
  disabled,
  adjacent,
  onSelect,
}: {
  match: Match
  rank: number
  selected: boolean
  disabled: boolean
  adjacent?: boolean
  onSelect: () => void
}) {
  return (
    <div
      onClick={disabled ? undefined : onSelect}
      className="animate-in"
      style={{
        background: selected
          ? 'var(--color-success-bg)'
          : disabled
          ? '#fafaf8'
          : 'var(--color-surface)',
        border: selected
          ? '1.5px solid var(--color-success-border)'
          : adjacent
          ? '1px solid var(--color-warning-border)'
          : '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        padding: '16px 18px',
        marginBottom: 10,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        transition: 'all 0.15s',
        animationDelay: `${rank * 0.05}s`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 10 }}>
        {/* Horse icon */}
        <div style={{
          width: 38,
          height: 38,
          borderRadius: '50%',
          background: adjacent ? 'var(--color-warning-bg)' : 'var(--color-accent-bg)',
          border: `1px solid ${adjacent ? 'var(--color-warning-border)' : 'var(--color-accent-border)'}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 17,
          flexShrink: 0,
        }}>
          🐴
        </div>

        {/* Name and meta */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 15,
            fontWeight: 600,
            color: selected ? 'var(--color-success)' : 'var(--color-text)',
            fontFamily: 'var(--font-display)',
          }}>
            {selected && '✓ '}{match.name}
          </div>
        </div>

        {/* Badges */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
          <span style={{
            fontSize: 11,
            padding: '2px 8px',
            borderRadius: 999,
            fontWeight: 600,
            background: 'var(--color-info-bg)',
            color: 'var(--color-info)',
            border: '1px solid var(--color-info-border)',
          }}>#{rank}</span>
          <span style={{
            fontSize: 11,
            padding: '2px 8px',
            borderRadius: 999,
            fontWeight: 600,
            background: adjacent ? 'var(--color-warning-bg)' : 'var(--color-success-bg)',
            color: adjacent ? 'var(--color-warning)' : 'var(--color-success)',
            border: `1px solid ${adjacent ? 'var(--color-warning-border)' : 'var(--color-success-border)'}`,
          }}>
            {adjacent ? 'Adjacent level' : 'Exact level'}
          </span>
        </div>
      </div>

      {/* Reason */}
      <p style={{
        fontSize: 13,
        color: 'var(--color-text-2)',
        lineHeight: 1.6,
        borderTop: '1px solid var(--color-border)',
        paddingTop: 10,
        marginBottom: match.warning ? 8 : 0,
      }}>
        {match.reason}
      </p>

      {/* Warning */}
      {match.warning && (
        <p style={{
          fontSize: 12,
          color: 'var(--color-warning)',
          background: 'var(--color-warning-bg)',
          border: '1px solid var(--color-warning-border)',
          borderRadius: 'var(--radius-sm)',
          padding: '6px 10px',
          marginTop: 6,
        }}>
          ⚠ {match.warning}
        </p>
      )}

      {/* Select prompt */}
      {!selected && !disabled && (
        <p style={{
          fontSize: 11,
          color: 'var(--color-text-muted)',
          marginTop: 8,
          textAlign: 'right',
        }}>
          Tap to assign this horse →
        </p>
      )}
    </div>
  )
}
