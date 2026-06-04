'use client'
import { useState, useEffect } from 'react'
import { DbHorse, LEVEL_LABELS } from '@/lib/horses'

// ─── Types ────────────────────────────────────────────────────────────────────

export type GuestRider = {
  id: string; name: string
  weight: number | null; age: number | null
  gender: string; riding_level: string; check_out_date: string
  horse_assignments?: { horse_name: string; incompatible: boolean; reason: string | null; status: string }[]
}

// ─── HorseAnalyticsBar ────────────────────────────────────────────────────────

export function HorseAnalyticsBar({ label, count, max, labelWidth = 90 }: { label: string; count: number; max: number; labelWidth?: number }) {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
      <div style={{ width: labelWidth, fontSize: 12, color: 'var(--color-text-2)', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</div>
      <div style={{ flex: 1, height: 8, background: 'var(--color-bg)', borderRadius: 4, overflow: 'hidden', border: '1px solid var(--color-border)' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: 'var(--color-accent)', borderRadius: 4, transition: 'width 0.3s' }} />
      </div>
      <div style={{ width: 30, fontSize: 12, color: 'var(--color-text-3)', textAlign: 'right', flexShrink: 0 }}>{count}</div>
    </div>
  )
}

// ─── HorseTrends ──────────────────────────────────────────────────────────────

export function HorseTrends({ horseName }: { horseName: string }) {
  const [riders, setRiders] = useState<GuestRider[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/guests')
      .then(r => r.json())
      .then((d: any) => {
        const all: GuestRider[] = d.guests || d || []
        setRiders(all.filter(g => (g.horse_assignments || []).some(a => a.horse_name === horseName)))
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [horseName])

  if (loading) return (
    <div style={{ borderTop: '1px solid var(--color-border)', padding: '12px 0', fontSize: 12, color: 'var(--color-text-3)' }}>
      Loading trends…
    </div>
  )

  if (riders.length === 0) return (
    <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 14, marginTop: 4 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Trends</div>
      <p style={{ fontSize: 12, color: 'var(--color-text-3)' }}>No assignment data yet.</p>
    </div>
  )

  const weights = riders.map(g => g.weight).filter((w): w is number => w != null)
  const ages = riders.map(g => g.age).filter((a): a is number => a != null)
  const avgWeight = weights.length > 0 ? Math.round(weights.reduce((a, b) => a + b, 0) / weights.length) : null
  const avgAge = ages.length > 0 ? Math.round(ages.reduce((a, b) => a + b, 0) / ages.length) : null

  const levelCount: Record<string, number> = {}
  riders.forEach(g => { if (g.riding_level) levelCount[g.riding_level] = (levelCount[g.riding_level] || 0) + 1 })
  const topLevel = Object.entries(levelCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—'

  const maleCount = riders.filter(g => g.gender?.toLowerCase() === 'male').length
  const femaleCount = riders.filter(g => g.gender?.toLowerCase() === 'female').length
  const genderTotal = maleCount + femaleCount
  const genderSplit = genderTotal > 0 ? `${Math.round(femaleCount / genderTotal * 100)}% F / ${Math.round(maleCount / genderTotal * 100)}% M` : null

  const doesntWorkList = riders.filter(g => (g.horse_assignments || []).some(a => a.horse_name === horseName && a.incompatible))
  const reasonCount: Record<string, number> = {}
  riders.forEach(g => {
    ;(g.horse_assignments || []).forEach(a => {
      if (a.horse_name === horseName && a.incompatible && a.reason) reasonCount[a.reason] = (reasonCount[a.reason] || 0) + 1
    })
  })
  const topReason = Object.entries(reasonCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

  const last10 = [...riders].sort((a, b) => (b.check_out_date || '').localeCompare(a.check_out_date || '')).slice(0, 10)

  const wtBuckets = [
    { label: 'Under 150', min: 0,   max: 149,      count: 0 },
    { label: '150–180',   min: 150,  max: 180,      count: 0 },
    { label: '181–210',   min: 181,  max: 210,      count: 0 },
    { label: '210+',      min: 211,  max: Infinity, count: 0 },
  ]
  weights.forEach(w => { const b = wtBuckets.find(bk => w >= bk.min && w <= bk.max); if (b) b.count++ })
  const maxWtBucket = Math.max(...wtBuckets.map(b => b.count), 1)

  return (
    <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 14, marginTop: 4 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>Trends</div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
        <div style={{ padding: '8px 10px', background: 'var(--color-bg)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
          <div style={{ fontSize: 10, color: 'var(--color-text-3)', marginBottom: 2 }}>Total riders</div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{riders.length}</div>
        </div>
        {avgWeight != null && (
          <div style={{ padding: '8px 10px', background: 'var(--color-bg)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
            <div style={{ fontSize: 10, color: 'var(--color-text-3)', marginBottom: 2 }}>Avg weight</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{avgWeight} lbs</div>
          </div>
        )}
        {avgAge != null && (
          <div style={{ padding: '8px 10px', background: 'var(--color-bg)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
            <div style={{ fontSize: 10, color: 'var(--color-text-3)', marginBottom: 2 }}>Avg age</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{avgAge} yrs</div>
          </div>
        )}
        <div style={{ padding: '8px 10px', background: 'var(--color-bg)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
          <div style={{ fontSize: 10, color: 'var(--color-text-3)', marginBottom: 2 }}>Typical level</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-accent)' }}>{LEVEL_LABELS[topLevel] || topLevel}</div>
        </div>
        {genderSplit && (
          <div style={{ padding: '8px 10px', background: 'var(--color-bg)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
            <div style={{ fontSize: 10, color: 'var(--color-text-3)', marginBottom: 2 }}>Gender split</div>
            <div style={{ fontSize: 12, fontWeight: 600 }}>{genderSplit}</div>
          </div>
        )}
      </div>

      {/* Doesn't work flags */}
      {doesntWorkList.length > 0 && (
        <div style={{ marginBottom: 14, padding: '9px 11px', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 'var(--radius-sm)' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#c2410c', marginBottom: topReason ? 2 : 0 }}>
            ⚠ {doesntWorkList.length} incompatible flag{doesntWorkList.length !== 1 ? 's' : ''} from {doesntWorkList.length} guest{doesntWorkList.length !== 1 ? 's' : ''}
          </div>
          {topReason && <div style={{ fontSize: 11, color: '#9a3412' }}>Most common: {topReason}</div>}
        </div>
      )}

      {/* Weight distribution */}
      {weights.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-2)', marginBottom: 8 }}>Weight distribution</div>
          {wtBuckets.map(b => <HorseAnalyticsBar key={b.label} label={b.label} count={b.count} max={maxWtBucket} labelWidth={80} />)}
        </div>
      )}

      {/* Last 10 riders */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-2)', marginBottom: 8 }}>
          Last {last10.length} rider{last10.length !== 1 ? 's' : ''}
        </div>
        <div style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
          {last10.map((g, i) => (
            <div key={g.id} style={{ padding: '7px 10px', borderBottom: i < last10.length - 1 ? '1px solid var(--color-border)' : 'none', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 600, fontSize: 12, flex: 1, minWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.name}</span>
              <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 999, background: 'var(--color-accent-bg)', color: 'var(--color-accent)', fontWeight: 600, flexShrink: 0 }}>{g.riding_level}</span>
              {g.weight != null && <span style={{ fontSize: 11, color: 'var(--color-text-3)', flexShrink: 0 }}>{g.weight} lb</span>}
              {g.gender && <span style={{ fontSize: 11, color: 'var(--color-text-3)', flexShrink: 0 }}>{g.gender === 'Male' ? 'M' : g.gender === 'Female' ? 'F' : g.gender}</span>}
              {g.check_out_date && <span style={{ fontSize: 10, color: 'var(--color-text-3)', flexShrink: 0 }}>{g.check_out_date}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── HorseAnalyticsPanel ──────────────────────────────────────────────────────

export function HorseAnalyticsPanel({ horses, guests: propGuests, onSelectHorse, onBack }: {
  horses: DbHorse[]
  guests?: GuestRider[]
  onSelectHorse?: (horse: DbHorse) => void
  onBack?: () => void
}) {
  const [fetchedGuests, setFetchedGuests] = useState<GuestRider[]>([])
  const [loading, setLoading] = useState(propGuests === undefined)

  useEffect(() => {
    if (propGuests !== undefined) { setLoading(false); return }
    fetch('/api/guests')
      .then(r => r.json())
      .then((d: any) => {
        const all: GuestRider[] = d.guests || d || []
        setFetchedGuests(all.filter(g => (g.horse_assignments || []).length > 0))
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [propGuests])

  const guests = propGuests !== undefined
    ? propGuests.filter(g => (g.horse_assignments || []).length > 0)
    : fetchedGuests

  type HorseStat = {
    name: string; horse: DbHorse
    totalAssignments: number; uniqueGuests: Set<string>
    weights: number[]; levels: string[]; genders: string[]; ages: number[]
    doesntWorkGuests: Set<string>; doesntWorkReasons: string[]
  }

  const statsMap: Record<string, HorseStat> = {}
  horses.forEach(h => {
    statsMap[h.name] = {
      name: h.name, horse: h,
      totalAssignments: 0, uniqueGuests: new Set(),
      weights: [], levels: [], genders: [], ages: [],
      doesntWorkGuests: new Set(), doesntWorkReasons: [],
    }
  })
  guests.forEach(g => {
    ;(g.horse_assignments || []).forEach(a => {
      const stat = statsMap[a.horse_name]
      if (!stat) return
      stat.totalAssignments++
      stat.uniqueGuests.add(g.id)
      if (g.weight) stat.weights.push(g.weight)
      if (g.riding_level) stat.levels.push(g.riding_level)
      if (g.gender) stat.genders.push(g.gender)
      if (g.age) stat.ages.push(g.age)
      if (a.incompatible) {
        stat.doesntWorkGuests.add(g.id)
        if (a.reason) stat.doesntWorkReasons.push(a.reason)
      }
    })
  })

  const stats = Object.values(statsMap)
  const assignedStats = stats.filter(s => s.totalAssignments > 0)

  const mostAssigned   = [...stats].sort((a, b) => b.totalAssignments - a.totalAssignments)[0]
  const mostReassigned = [...stats].sort((a, b) => b.uniqueGuests.size  - a.uniqueGuests.size)[0]
  const totalAll       = stats.reduce((sum, s) => sum + s.totalAssignments, 0)
  const avgPerHorse    = assignedStats.length > 0 ? (totalAll / assignedStats.length).toFixed(1) : '0'

  const ranked   = [...stats].sort((a, b) => b.totalAssignments - a.totalAssignments)
  const maxAsgn  = ranked[0]?.totalAssignments || 1

  const riderTypeStats = [...assignedStats].sort((a, b) => a.name.localeCompare(b.name))

  const flaggedHorses = stats
    .filter(s => s.doesntWorkGuests.size >= 3)
    .sort((a, b) => b.doesntWorkGuests.size - a.doesntWorkGuests.size)

  function topOf(arr: string[]): string {
    const c: Record<string, number> = {}
    arr.forEach(v => { c[v] = (c[v] || 0) + 1 })
    return Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—'
  }
  function genderSplitOf(genders: string[]): string {
    const f = genders.filter(g => g.toLowerCase() === 'female').length
    const m = genders.filter(g => g.toLowerCase() === 'male').length
    const t = f + m
    return t > 0 ? `${Math.round(f / t * 100)}% F / ${Math.round(m / t * 100)}% M` : '—'
  }
  function avgOf(nums: number[]): number | null {
    return nums.length > 0 ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length) : null
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
      {onBack && (
        <button onClick={onBack} style={{ marginBottom: 16, padding: '7px 14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: 'var(--color-surface)', fontSize: 13, cursor: 'pointer', color: 'var(--color-text-2)', fontWeight: 500 }}>
          ← Back to Roster
        </button>
      )}

      {loading ? (
        <p style={{ textAlign: 'center', color: 'var(--color-text-3)', fontSize: 13, padding: 32 }}>Loading analytics...</p>
      ) : (
        <>
          {/* ── Section 1: Overview ── */}
          <div style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 12 }}>Overview</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
              {[
                { label: 'Active horses',    val: String(horses.length) },
                { label: 'Most assigned',    val: mostAssigned && mostAssigned.totalAssignments > 0 ? `${mostAssigned.name} (${mostAssigned.totalAssignments})` : '—', small: true },
                { label: 'Most riders',      val: mostReassigned && mostReassigned.uniqueGuests.size > 0 ? `${mostReassigned.name} (${mostReassigned.uniqueGuests.size})` : '—', small: true },
                { label: 'Avg assignments',  val: avgPerHorse },
              ].map(c => (
                <div key={c.label} style={{ padding: '12px 14px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)' }}>
                  <div style={{ fontSize: 10, color: 'var(--color-text-3)', textTransform: 'uppercase' as const, letterSpacing: '0.04em', marginBottom: 4 }}>{c.label}</div>
                  <div style={{ fontSize: c.small ? 14 : 24, fontWeight: 700, lineHeight: 1.3 }}>{c.val}</div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Section 2: Utilization ── */}
          <div style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 12 }}>Utilization</div>
            <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
              {ranked.map((s, i) => {
                const pct  = maxAsgn > 0 ? Math.round((s.totalAssignments / maxAsgn) * 100) : 0
                const tier = s.totalAssignments >= maxAsgn * 0.75 ? 'High'
                           : s.totalAssignments > 0 && s.totalAssignments <= maxAsgn * 0.25 ? 'Low'
                           : null
                return (
                  <div
                    key={s.name}
                    onClick={onSelectHorse ? () => onSelectHorse(s.horse) : undefined}
                    style={{ padding: '10px 14px', borderBottom: i < ranked.length - 1 ? '1px solid var(--color-border)' : 'none', cursor: onSelectHorse ? 'pointer' : 'default', display: 'flex', alignItems: 'center', gap: 10 }}
                  >
                    <div style={{ width: 110, fontWeight: 600, fontSize: 13, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</div>
                    <div style={{ flex: 1, height: 8, background: 'var(--color-bg)', borderRadius: 4, overflow: 'hidden', border: '1px solid var(--color-border)' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: 'var(--color-accent)', borderRadius: 4 }} />
                    </div>
                    <div style={{ width: 28, fontSize: 12, color: 'var(--color-text-3)', textAlign: 'right', flexShrink: 0 }}>{s.totalAssignments}</div>
                    <div style={{ width: 34, fontSize: 10, fontWeight: 600, textAlign: 'right', flexShrink: 0, color: tier === 'High' ? '#16a34a' : 'var(--color-text-3)' }}>{tier ?? ''}</div>
                  </div>
                )
              })}
              {ranked.length === 0 && <div style={{ padding: 20, textAlign: 'center', fontSize: 12, color: 'var(--color-text-3)' }}>No assignment data yet</div>}
            </div>
          </div>

          {/* ── Section 3: Rider Profile by Horse ── */}
          <div style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 12 }}>Rider Profile by Horse</div>
            <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 60px 50px 1fr', gap: 8, padding: '8px 14px', borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg)' }}>
                {['Horse', 'Avg wt', 'Level', 'Gender'].map(col => (
                  <div key={col} style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-3)', textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>{col}</div>
                ))}
              </div>
              {riderTypeStats.map((s, i) => {
                const avgWt  = avgOf(s.weights)
                const topLvl = topOf(s.levels)
                const gSplit = genderSplitOf(s.genders)
                return (
                  <div
                    key={s.name}
                    onClick={onSelectHorse ? () => onSelectHorse(s.horse) : undefined}
                    style={{ display: 'grid', gridTemplateColumns: '1fr 60px 50px 1fr', gap: 8, padding: '9px 14px', borderBottom: i < riderTypeStats.length - 1 ? '1px solid var(--color-border)' : 'none', cursor: onSelectHorse ? 'pointer' : 'default', alignItems: 'center' }}
                  >
                    <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--color-text-2)' }}>{avgWt != null ? `${avgWt} lb` : '—'}</div>
                    <div><span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 999, background: 'var(--color-accent-bg)', color: 'var(--color-accent)', fontWeight: 600 }}>{topLvl}</span></div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-2)' }}>{gSplit}</div>
                  </div>
                )
              })}
              {riderTypeStats.length === 0 && <div style={{ padding: 20, textAlign: 'center', fontSize: 12, color: 'var(--color-text-3)' }}>No data yet</div>}
            </div>
          </div>

          {/* ── Section 4: Flags to Watch ── */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 12 }}>Flags to Watch</div>
            {flaggedHorses.length === 0 ? (
              <div style={{ padding: '14px 16px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', fontSize: 12, color: 'var(--color-text-3)' }}>
                No horses with 3+ incompatibility flags
              </div>
            ) : (
              <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
                {flaggedHorses.map((s, i) => {
                  const topReason = s.doesntWorkReasons.length > 0 ? topOf(s.doesntWorkReasons) : null
                  return (
                    <div
                      key={s.name}
                      onClick={onSelectHorse ? () => onSelectHorse(s.horse) : undefined}
                      style={{ padding: '10px 14px', borderBottom: i < flaggedHorses.length - 1 ? '1px solid var(--color-border)' : 'none', cursor: onSelectHorse ? 'pointer' : 'default', display: 'flex', alignItems: 'center', gap: 10 }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{s.name}</div>
                        {topReason && <div style={{ fontSize: 11, color: 'var(--color-text-3)', marginTop: 2 }}>{topReason}</div>}
                      </div>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5', fontWeight: 600, flexShrink: 0 }}>
                        {s.doesntWorkGuests.size} guest{s.doesntWorkGuests.size !== 1 ? 's' : ''}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
