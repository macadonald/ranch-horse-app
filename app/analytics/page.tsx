'use client'
import { useState, useEffect } from 'react'
import Sidebar from '@/components/Sidebar'
import { GuestAnalyticsPanel, type AnalyticsGuest } from '@/components/GuestAnalyticsPanel'
import { HorseAnalyticsPanel } from '@/components/HorseAnalyticsPanel'
import { DbHorse } from '@/lib/horses'
import { getTucsonToday } from '@/lib/timezone'

type AnalyticsView = 'correlations' | 'guests' | 'horses'

// ─── Weight buckets ───────────────────────────────────────────────────────────

const WT_BUCKETS = [
  { label: 'Under 150', min: 0,   max: 149 },
  { label: '150–180',   min: 150, max: 180 },
  { label: '181–210',   min: 181, max: 210 },
  { label: '210+',      min: 211, max: Infinity },
]

const LEVELS = ['B', 'AB', 'I', 'AI', 'A']
const LEVEL_LABELS: Record<string, string> = {
  B: 'Beginner', AB: 'Adv Beginner', I: 'Intermediate', AI: 'Adv Intermediate', A: 'Advanced',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getWtBucket(weight: number | null | undefined): string | null {
  if (!weight) return null
  const b = WT_BUCKETS.find(bk => weight >= bk.min && weight <= bk.max)
  return b ? b.label : null
}

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
  const wtRows: WtRow[] = WT_BUCKETS.map(bk => {
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

  const selectedBucket = WT_BUCKETS.find(b => b.label === matchWeight) || null
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

      {/* ── 1. Weight × Reassignment ── */}
      <div style={SEC_STYLE}>
        <SectionHeader title="Weight × Reassignment Rate" />
        <p style={{ fontSize: 11, color: 'var(--color-text-3)', marginBottom: 12 }}>
          How often guests in each weight range receive a doesn&apos;t-work flag
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

      {/* ── 4. Best Match Finder ── */}
      <div style={SEC_STYLE}>
        <SectionHeader title="Best Match Finder" />
        <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
          <select value={matchWeight} onChange={e => setMatchWeight(e.target.value)} style={selectStyle}>
            <option value=''>Any weight</option>
            {WT_BUCKETS.map(b => <option key={b.label} value={b.label}>{b.label} lbs</option>)}
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

export default function AnalyticsPage() {
  const today = getTucsonToday()
  const [view, setView]       = useState<AnalyticsView>('correlations')
  const [guests, setGuests]   = useState<AnalyticsGuest[]>([])
  const [horses, setHorses]   = useState<DbHorse[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('/api/guests').then(r => r.json()),
      fetch('/api/horses').then(r => r.json()),
    ]).then(([gd, hd]) => {
      setGuests(gd.guests || gd || [])
      setHorses((hd.horses || []).filter((h: DbHorse) => h.is_active))
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
        {/* Header */}
        <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', background: 'var(--color-surface)' }}>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, flex: 1, minWidth: 120 }}>Analytics</h1>
          <div style={{ display: 'flex', gap: 6 }}>
            {tabBtn('correlations', 'Correlations')}
            {tabBtn('guests',       'Guests')}
            {tabBtn('horses',       'Horses')}
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <p style={{ color: 'var(--color-text-3)', fontSize: 13 }}>Loading analytics…</p>
          </div>
        ) : view === 'guests' ? (
          <GuestAnalyticsPanel guests={gwa} today={today} />
        ) : view === 'horses' ? (
          <HorseAnalyticsPanel horses={horses} guests={gwa} />
        ) : (
          <CorrelationsView guests={guests} horses={horses} />
        )}
      </div>
    </div>
  )
}
