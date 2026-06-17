'use client'

// ─── Types ────────────────────────────────────────────────────────────────────

const LEVELS = [
  { key: 'B',  label: 'Beginner' },
  { key: 'AB', label: 'Adv Beginner' },
  { key: 'I',  label: 'Intermediate' },
  { key: 'AI', label: 'Adv Intermediate' },
  { key: 'A',  label: 'Advanced' },
]

export type AnalyticsAssignment = {
  id: string; horse_name: string; assignment_type: string; status: string
  incompatible: boolean; requested_by_guest: boolean; reason: string
  loves_horse?: boolean
}

export type AnalyticsGuest = {
  id: string; name: string
  check_in_date: string; check_out_date: string
  age: number; weight: number; gender: string; riding_level: string
  checked_out?: boolean
  repeat_guest?: boolean
  horse_assignments?: AnalyticsAssignment[]
}

// ─── AnalyticsBarRow ──────────────────────────────────────────────────────────

export function AnalyticsBarRow({ label, count, max, labelWidth = 90 }: { label: string; count: number; max: number; labelWidth?: number }) {
  const pct = max > 0 ? Math.max((count / max) * 100, count > 0 ? 2 : 0) : 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
      <div style={{ width: labelWidth, fontSize: 12, color: 'var(--color-text-2)', flexShrink: 0, textAlign: 'right' }}>{label}</div>
      <div style={{ flex: 1, height: 14, background: 'var(--color-bg)', borderRadius: 3, overflow: 'hidden', border: '1px solid var(--color-border)' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: 'var(--color-accent)', borderRadius: 3 }} />
      </div>
      <div style={{ width: 28, fontSize: 12, color: 'var(--color-text-3)', textAlign: 'right', flexShrink: 0 }}>{count}</div>
    </div>
  )
}

// ─── GuestAnalyticsPanel ─────────────────────────────────────────────────────

export function GuestAnalyticsPanel({ guests, today, onBack }: {
  guests: AnalyticsGuest[]
  today: string
  onBack?: () => void
}) {
  // Only guests with at least one horse assignment
  const gwa = guests.filter(g => g.horse_assignments && g.horse_assignments.length > 0)
  const n = gwa.length

  // 1. Overview
  const activeCount = gwa.filter(g => !g.checked_out && (!g.check_out_date || g.check_out_date >= today)).length
  const assignedHorseNames = new Set(
    gwa.flatMap(g => (g.horse_assignments || []).filter(a => !a.incompatible).map(a => a.horse_name))
  )
  const inDates = gwa.filter(g => g.check_in_date).map(g => g.check_in_date)
  const earliest = inDates.length ? inDates.reduce((a, b) => a < b ? a : b) : null
  const latest   = inDates.length ? inDates.reduce((a, b) => a > b ? a : b) : null
  const weeksSpan = earliest && latest
    ? Math.max(1, Math.ceil((new Date(latest + 'T12:00:00').getTime() - new Date(earliest + 'T12:00:00').getTime()) / (7 * 24 * 60 * 60 * 1000)))
    : 1
  const avgPerWeek = n > 0 ? (n / weeksSpan).toFixed(1) : '—'

  // 2. Rider breakdown
  let maleCount = 0, femaleCount = 0
  const ageRanges  = [{ label: 'Under 18', count: 0 }, { label: '18–30', count: 0 }, { label: '31–45', count: 0 }, { label: '46–60', count: 0 }, { label: '60+', count: 0 }]
  const wtRanges   = [{ label: 'Under 150', count: 0 }, { label: '150–180', count: 0 }, { label: '181–210', count: 0 }, { label: '211–250', count: 0 }, { label: '250+', count: 0 }]
  const lvlCounts: Record<string, number> = {}

  gwa.forEach(g => {
    const gender = (g.gender || '').toLowerCase()
    if (gender === 'male') maleCount++; else if (gender === 'female') femaleCount++
    if (g.age) {
      if (g.age < 18) ageRanges[0].count++
      else if (g.age <= 30) ageRanges[1].count++
      else if (g.age <= 45) ageRanges[2].count++
      else if (g.age <= 60) ageRanges[3].count++
      else ageRanges[4].count++
    }
    if (g.weight) {
      if (g.weight < 150) wtRanges[0].count++
      else if (g.weight <= 180) wtRanges[1].count++
      else if (g.weight <= 210) wtRanges[2].count++
      else if (g.weight <= 250) wtRanges[3].count++
      else wtRanges[4].count++
    }
    if (g.riding_level) lvlCounts[g.riding_level] = (lvlCounts[g.riding_level] || 0) + 1
  })

  const genderTotal = maleCount + femaleCount
  const malePct    = genderTotal > 0 ? Math.round((maleCount   / genderTotal) * 100) : 0
  const femalePct  = genderTotal > 0 ? Math.round((femaleCount / genderTotal) * 100) : 0
  const maxAge = Math.max(...ageRanges.map(r => r.count), 1)
  const maxWt  = Math.max(...wtRanges.map(r => r.count), 1)
  const lvlRows = LEVELS.map(l => ({ label: l.label, key: l.key, count: lvlCounts[l.key] || 0 }))
  const maxLvl  = Math.max(...lvlRows.map(r => r.count), 1)

  // 3. Doesn't-work patterns
  const dwByHorse: Record<string, { ids: Set<string>; reasons: string[] }> = {}
  gwa.forEach(g => {
    ;(g.horse_assignments || []).filter(a => a.incompatible).forEach(a => {
      if (!dwByHorse[a.horse_name]) dwByHorse[a.horse_name] = { ids: new Set(), reasons: [] }
      dwByHorse[a.horse_name].ids.add(g.id)
      if (a.reason) dwByHorse[a.horse_name].reasons.push(a.reason)
    })
  })
  const flaggedHorses = Object.entries(dwByHorse)
    .filter(([, v]) => v.ids.size >= 3)
    .map(([horse, v]) => {
      const rc: Record<string, number> = {}
      v.reasons.forEach(r => { rc[r] = (rc[r] || 0) + 1 })
      const topReason = Object.entries(rc).sort(([, a], [, b]) => b - a)[0]?.[0] ?? null
      return { horse, count: v.ids.size, topReason }
    })
    .sort((a, b) => b.count - a.count)

  // 4. Busiest checkout days
  const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const dowCounts: Record<number, number> = {}
  const womCounts: Record<number, number> = {}
  gwa.forEach(g => {
    if (!g.check_out_date) return
    const d = new Date(g.check_out_date + 'T12:00:00')
    const dow = d.getDay(); dowCounts[dow] = (dowCounts[dow] || 0) + 1
    const wom = Math.ceil(d.getDate() / 7); womCounts[wom] = (womCounts[wom] || 0) + 1
  })
  const sortedDays  = Object.entries(dowCounts).sort(([, a], [, b]) => b - a).map(([d, c]) => ({ label: DOW[+d], count: c }))
  const sortedWeeks = Object.entries(womCounts).sort(([, a], [, b]) => b - a).map(([w, c]) => ({ label: `Week ${w}`, count: c }))
  const maxDay = Math.max(...sortedDays.map(d => d.count), 1)
  const maxWom = Math.max(...sortedWeeks.map(w => w.count), 1)

  // 6. Repeat vs new (all guests, active + checked-out)
  const repeatCount = guests.filter(g => g.repeat_guest === true).length
  const guestTotal  = guests.length
  const newCount    = guestTotal - repeatCount
  const repeatPct   = guestTotal > 0 ? Math.round((repeatCount / guestTotal) * 100) : 0
  const newPct      = guestTotal > 0 ? 100 - repeatPct : 0

  // 5. Length of stay
  const stays: number[] = []
  gwa.forEach(g => {
    if (!g.check_in_date || !g.check_out_date) return
    const nights = Math.round((new Date(g.check_out_date + 'T12:00:00').getTime() - new Date(g.check_in_date + 'T12:00:00').getTime()) / 86400000)
    if (nights > 0 && nights < 60) stays.push(nights)
  })
  const avgStay = stays.length ? (stays.reduce((a, b) => a + b, 0) / stays.length).toFixed(1) : null
  const stayCounts: Record<number, number> = {}
  stays.forEach(s => { stayCounts[s] = (stayCounts[s] || 0) + 1 })
  const mostCommonStay = stays.length ? Object.entries(stayCounts).sort(([, a], [, b]) => b - a)[0] : null

  const backBtn = { fontSize: 13, fontWeight: 600, color: 'var(--color-text-2)' as const, background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '999px', padding: '6px 14px', cursor: 'pointer' as const, marginBottom: 14, display: 'inline-block' }
  const sec = { background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: '14px 16px', marginBottom: 14 }

  if (n === 0) return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
      {onBack && <button onClick={onBack} style={backBtn}>← Back to Guests</button>}
      <p style={{ color: 'var(--color-text-3)', fontSize: 13 }}>No guests with horse assignments found.</p>
    </div>
  )

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 48px' }}>
      {onBack && <button onClick={onBack} style={backBtn}>← Back to Guests</button>}
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, marginBottom: 14 }}>Guest Analytics</h2>

      {/* 1. Overview cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 14 }}>
        {([
          { label: 'Guests in history', value: n },
          { label: 'Active right now',  value: activeCount },
          { label: 'Horses assigned',   value: assignedHorseNames.size },
          { label: 'Avg guests / week', value: avgPerWeek },
        ] as { label: string; value: string | number }[]).map(c => (
          <div key={c.label} style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '12px 14px', textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--color-text)' }}>{c.value}</div>
            <div style={{ fontSize: 11, color: 'var(--color-text-3)', marginTop: 3 }}>{c.label}</div>
          </div>
        ))}
      </div>

      {/* 2. Rider breakdown */}
      <div style={sec}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Rider Breakdown</div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-2)', marginBottom: 6 }}>Gender</div>
          {genderTotal > 0 ? (
            <>
              <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', marginBottom: 7, background: 'var(--color-border)' }}>
                <div style={{ width: `${malePct}%`, background: '#60a5fa' }} />
                <div style={{ width: `${femalePct}%`, background: '#f472b6' }} />
              </div>
              <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--color-text-2)' }}>
                <span>Male: <strong>{maleCount}</strong> ({malePct}%)</span>
                <span>Female: <strong>{femaleCount}</strong> ({femalePct}%)</span>
              </div>
            </>
          ) : <p style={{ fontSize: 12, color: 'var(--color-text-3)' }}>No gender data recorded</p>}
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-2)', marginBottom: 6 }}>Age</div>
          {ageRanges.map(r => <AnalyticsBarRow key={r.label} label={r.label} count={r.count} max={maxAge} />)}
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-2)', marginBottom: 6 }}>Weight (lbs)</div>
          {wtRanges.map(r => <AnalyticsBarRow key={r.label} label={r.label} count={r.count} max={maxWt} />)}
        </div>

        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-2)', marginBottom: 6 }}>Riding Level</div>
          {lvlRows.map(r => <AnalyticsBarRow key={r.key} label={r.label} count={r.count} max={maxLvl} labelWidth={130} />)}
        </div>
      </div>

      {/* 3. Flags to watch */}
      <div style={sec}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Flags to Watch</div>
        <p style={{ fontSize: 11, color: 'var(--color-text-3)', marginBottom: 12 }}>Horses with 3+ doesn&apos;t-work flags from different guests</p>
        {flaggedHorses.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--color-text-3)' }}>No horses have reached that threshold yet.</p>
        ) : flaggedHorses.map(h => (
          <div key={h.horse} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 0', borderBottom: '1px solid var(--color-border)' }}>
            <span style={{ fontSize: 14, flexShrink: 0 }}>🐴</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{h.horse}</div>
              {h.topReason && <div style={{ fontSize: 11, color: 'var(--color-text-3)', marginTop: 2 }}>Most common reason: {h.topReason}</div>}
            </div>
            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: 'var(--color-danger-bg)', color: 'var(--color-danger)', border: '1px solid var(--color-danger-border)', fontWeight: 600, flexShrink: 0 }}>
              {h.count} flag{h.count !== 1 ? 's' : ''}
            </span>
          </div>
        ))}
      </div>

      {/* 4. Busiest checkout days */}
      <div style={sec}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Busiest Checkout Days</div>
        {sortedDays.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--color-text-3)' }}>Not enough data yet.</p>
        ) : (
          <>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-2)', marginBottom: 6 }}>Day of week</div>
            {sortedDays.map(d => <AnalyticsBarRow key={d.label} label={d.label} count={d.count} max={maxDay} labelWidth={80} />)}
            {sortedWeeks.length > 0 && <>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-2)', marginBottom: 6, marginTop: 14 }}>Week of month</div>
              {sortedWeeks.map(w => <AnalyticsBarRow key={w.label} label={w.label} count={w.count} max={maxWom} />)}
            </>}
          </>
        )}
      </div>

      {/* 5. Length of stay */}
      <div style={sec}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Length of Stay</div>
        {!avgStay ? (
          <p style={{ fontSize: 13, color: 'var(--color-text-3)' }}>Not enough data yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span style={{ fontSize: 26, fontWeight: 700, fontFamily: 'var(--font-display)' }}>{avgStay}</span>
              <span style={{ fontSize: 12, color: 'var(--color-text-3)' }}>avg nights · {stays.length} guests</span>
            </div>
            {mostCommonStay && (
              <div style={{ fontSize: 13, color: 'var(--color-text-2)' }}>
                Most common stay: <strong>{mostCommonStay[0]} night{+mostCommonStay[0] !== 1 ? 's' : ''}</strong>
                <span style={{ fontSize: 11, color: 'var(--color-text-3)', marginLeft: 6 }}>({mostCommonStay[1]} guests)</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 6. Repeat vs New */}
      <div style={sec}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Repeat vs New Guests</div>
        {guestTotal === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--color-text-3)' }}>No guest data yet.</p>
        ) : (
          <>
            <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', marginBottom: 10, background: 'var(--color-border)' }}>
              {repeatPct > 0 && <div style={{ width: `${repeatPct}%`, background: '#34d399' }} />}
              {newPct > 0 && <div style={{ width: `${newPct}%`, background: '#93c5fd' }} />}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '10px 12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#34d399', flexShrink: 0 }} />
                  <span style={{ fontSize: 11, color: 'var(--color-text-3)', fontWeight: 600 }}>Repeat</span>
                </div>
                <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--color-text)' }}>{repeatCount}</div>
                <div style={{ fontSize: 11, color: 'var(--color-text-3)', marginTop: 2 }}>{repeatPct}% of all guests</div>
              </div>
              <div style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '10px 12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#93c5fd', flexShrink: 0 }} />
                  <span style={{ fontSize: 11, color: 'var(--color-text-3)', fontWeight: 600 }}>New</span>
                </div>
                <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--color-text)' }}>{newCount}</div>
                <div style={{ fontSize: 11, color: 'var(--color-text-3)', marginTop: 2 }}>{newPct}% of all guests</div>
              </div>
            </div>
            <div style={{ fontSize: 11, color: 'var(--color-text-3)', marginTop: 8 }}>{guestTotal} total guests · active + checked out</div>
          </>
        )}
      </div>
    </div>
  )
}
