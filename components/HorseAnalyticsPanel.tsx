'use client'
import { useState, useEffect, useRef } from 'react'
import { DbHorse, LEVEL_LABELS, LEVEL_ORDER } from '@/lib/horses'
import { WEIGHT_BANDS } from '@/lib/weightBands'
import { horseWeightCeiling as _hWC, horseLevelRange as _hLR, isHorseBlockedToday as _hBlocked } from '@/lib/horseFit'

// ─── Types ────────────────────────────────────────────────────────────────────

export type GuestRider = {
  id: string; name: string
  weight: number | null; age: number | null
  gender: string; riding_level: string; check_out_date: string; check_in_date?: string
  checked_out?: boolean; checked_out_at?: string | null
  horse_assignments?: { horse_name: string; incompatible: boolean; reason: string | null; status: string; removed_at?: string | null; assigned_at?: string | null }[]
}

type HerdLoadDay = { date: string; single: number; doubled: number; tripled: number; unused: number }

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
            ⚠ {doesntWorkList.length} not a fit flag{doesntWorkList.length !== 1 ? 's' : ''} from {doesntWorkList.length} guest{doesntWorkList.length !== 1 ? 's' : ''}
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
              {g.age != null && <span style={{ fontSize: 11, color: 'var(--color-text-3)', flexShrink: 0 }}>{g.age}y</span>}
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
  const [showAllIdle, setShowAllIdle] = useState(false)
  const [selectedCard, setSelectedCard] = useState<string | null>(null)
  const detailRef = useRef<HTMLDivElement>(null)

  const [herdLoadDays, setHerdLoadDays]           = useState<HerdLoadDay[] | null>(null)
  const [herdLoadOpen, setHerdLoadOpen]           = useState(false)
  const [herdLoadSelIdx, setHerdLoadSelIdx]       = useState<number | null>(null)
  const [herdLoadNoSug, setHerdLoadNoSug]         = useState<{ date: string; count: number }[]>([])
  const [herdLoadNoSugTotal, setHerdLoadNoSugTotal] = useState(0)

  useEffect(() => {
    if (propGuests !== undefined) { setLoading(false); return }
    fetch('/api/guests')
      .then(r => r.json())
      .then((d: any) => {
        const all: GuestRider[] = d.guests || d || []
        setFetchedGuests(all)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [propGuests])

  useEffect(() => {
    if (selectedCard && detailRef.current) {
      detailRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [selectedCard])

  useEffect(() => {
    fetch('/api/herd-load')
      .then(r => r.json())
      .then((d: any) => {
        setHerdLoadDays(d.days ?? [])
        setHerdLoadNoSug(d.noSuggestion ?? [])
        setHerdLoadNoSugTotal(d.noSuggestionTotal ?? 0)
      })
      .catch(() => {})
  }, [])

  const allGuests = propGuests !== undefined ? propGuests : fetchedGuests
  const guests = allGuests.filter(g => (g.horse_assignments || []).length > 0)

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

  const cutoff60 = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000)
    .toLocaleDateString('en-CA', { timeZone: 'America/Phoenix' })
  const counts60: Record<string, number> = {}
  guests.forEach(g => {
    if (!g.check_in_date || g.check_in_date < cutoff60) return
    ;(g.horse_assignments || []).forEach(a => {
      if (!statsMap[a.horse_name]) return
      counts60[a.horse_name] = (counts60[a.horse_name] || 0) + 1
    })
  })
  const top10Last60 = Object.entries(counts60)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, count]) => ({ name, count }))
  const max60 = top10Last60[0]?.count || 1

  function topOf(arr: string[]): string {
    const c: Record<string, number> = {}
    arr.forEach(v => { c[v] = (c[v] || 0) + 1 })
    return Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—'
  }

  function fmtDay(s: string): string {
    const [y, m, d] = s.split('-').map(Number)
    const dt = new Date(Date.UTC(y, m - 1, d))
    const mo = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    return `${mo[dt.getUTCMonth()]} ${dt.getUTCDate()}`
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
  function maxOf(nums: number[]): number | null {
    return nums.length > 0 ? Math.max(...nums) : null
  }

  // ── Part 3: Idle streaks ───────────────────────────────────────────────────
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Phoenix' })
  const IDLE_SHOW = 15

  const idleRows = horses.map(h => {
    const activeFlags = (h.flags || []).filter(f =>
      f.status === 'active' && ['lame', 'injured', 'retired', 'in_training'].includes(f.flag_type)
    )
    let workingNow = false
    let lastWorked: string | null = null
    guests.forEach(g => {
      if (!g.check_in_date || g.check_in_date > today) return
      ;(g.horse_assignments || []).forEach(a => {
        if (a.horse_name !== h.name || a.incompatible) return
        if (a.status === 'active' && !g.checked_out) { workingNow = true; return }
        const cands: string[] = [today]
        if (g.check_out_date) cands.push(g.check_out_date)
        if (a.removed_at) cands.push(a.removed_at.slice(0, 10))
        const end = cands.reduce((m, d) => d < m ? d : m)
        if (!lastWorked || end > lastWorked) lastWorked = end
      })
    })
    const idleDays = workingNow ? 0 : lastWorked
      ? Math.max(0, Math.round((new Date(today + 'T12:00:00').getTime() - new Date(lastWorked + 'T12:00:00').getTime()) / 86400000))
      : null
    return { horse: h, workingNow, lastWorked, idleDays, activeFlags }
  }).sort((a, b) => {
    if (a.workingNow !== b.workingNow) return a.workingNow ? 1 : -1
    if (a.idleDays === null && b.idleDays === null) return a.horse.name.localeCompare(b.horse.name)
    if (a.idleDays === null) return 1
    if (b.idleDays === null) return -1
    return b.idleDays - a.idleDays
  })
  const displayedIdleRows = showAllIdle ? idleRows : idleRows.slice(0, IDLE_SHOW)
  const FLAG_LABELS: Record<string, string> = { lame: 'Lame', injured: 'Injured', retired: 'Retired', in_training: 'In training' }

  // ── Part 4: Draft usage ───────────────────────────────────────────────────
  const WAVE5_DATE = '2026-09-10'
  const draftSet = new Set(horses.filter(h => h.is_draft).map(h => h.name))

  const draftBandRows = WEIGHT_BANDS.map(bk => {
    let bT = 0, bD = 0, aT = 0, aD = 0
    guests.forEach(g => {
      if (!g.weight || g.weight < bk.min || g.weight > bk.max) return
      ;(g.horse_assignments || []).forEach(a => {
        if (a.incompatible || !a.assigned_at) return
        const d = a.assigned_at.slice(0, 10)
        const isDraft = draftSet.has(a.horse_name)
        if (d < WAVE5_DATE) { bT++; if (isDraft) bD++ }
        else { aT++; if (isDraft) aD++ }
      })
    })
    return { label: bk.label, before: { total: bT, draft: bD }, after: { total: aT, draft: aD } }
  })
  function draftCell(d: { total: number; draft: number }): string {
    if (d.total === 0) return '—'
    return `${Math.round((d.draft / d.total) * 100)}% · ${d.draft} of ${d.total}`
  }

  // ── Herd Depth ──────────────────────────────────────────────────────────────

  const herd = horses.filter(h => h.is_active && !h.is_deceased)

  // Per-horse historical stats from guest assignment data (for accurate level range)
  const depthHistStats: Record<string, { levels: string[]; maxWeight: number; count: number }> = {}
  guests.forEach(g => {
    ;(g.horse_assignments || []).forEach(a => {
      if (!depthHistStats[a.horse_name]) depthHistStats[a.horse_name] = { levels: [], maxWeight: 0, count: 0 }
      const ds = depthHistStats[a.horse_name]
      if (g.riding_level && !ds.levels.includes(g.riding_level)) ds.levels.push(g.riding_level)
      if (g.weight) ds.maxWeight = Math.max(ds.maxWeight, g.weight)
      ds.count++
    })
  })

  const hWCeiling = (h: DbHorse): number =>
    _hWC(h.weight, depthHistStats[h.name]?.maxWeight ?? 0)

  const hLevelRangeFn = (h: DbHorse): { min: number; max: number } => {
    const idx = LEVEL_ORDER.indexOf(h.level)
    if (idx === -1) return { min: -1, max: -1 }
    const ds = depthHistStats[h.name]
    return _hLR(idx, ds?.count ?? 0, ds?.levels ?? [])
  }

  const isHorseAvailable = (h: DbHorse): boolean =>
    !h.exclude_from_ai && !_hBlocked(h.flags || [], today)

  const getFlagReason = (h: DbHorse): string | null => {
    const f = (h.flags || []).find(fl => {
      if (fl.flag_type === 'day_off') return fl.day_off_date === today
      return ['lame', 'injured', 'in_training', 'retired'].includes(fl.flag_type)
    })
    if (!f) return null
    const lbls: Record<string, string> = { lame: 'lame', injured: 'injured', in_training: 'in training', retired: 'retired', day_off: 'day off' }
    return lbls[f.flag_type] ?? f.flag_type
  }

  const onPropertyToday = allGuests.filter(g =>
    !g.checked_out &&
    g.check_in_date != null && g.check_in_date <= today &&
    g.check_out_date >= today
  )

  const CARD_LEVEL_LABELS: Record<string, string> = {
    B: 'Beginner', AB: 'Adv Beginner', I: 'Intermediate',
    'I/AI': 'Int / Adv Int', AI: 'Adv Intermediate', A: 'Advanced',
  }

  type DepthCardDef = {
    key: string; title: string
    horseFn: (h: DbHorse) => boolean
    guestFn: (g: GuestRider) => boolean
  }

  const DEPTH_CARD_DEFS: DepthCardDef[] = [
    { key: 'kids', title: 'Kid horses', horseFn: h => h.takes_kids, guestFn: g => (g.age ?? 999) < 13 },
    ...LEVEL_ORDER.map(lvl => ({
      key: `lvl_${lvl}`,
      title: CARD_LEVEL_LABELS[lvl] || lvl,
      horseFn: (h: DbHorse) => {
        const r = hLevelRangeFn(h)
        const lIdx = LEVEL_ORDER.indexOf(lvl)
        return r.min !== -1 && lIdx >= r.min && lIdx <= r.max
      },
      guestFn: (g: GuestRider) => g.riding_level === lvl,
    })),
    { key: 'w200', title: 'Carries 200+ lb', horseFn: h => hWCeiling(h) >= 200, guestFn: g => (g.weight ?? 0) >= 200 },
    { key: 'w220', title: 'Carries 220+ lb', horseFn: h => hWCeiling(h) >= 220, guestFn: g => (g.weight ?? 0) >= 220 },
    { key: 'w260', title: 'Carries 260+ lb', horseFn: h => hWCeiling(h) >= 260, guestFn: g => (g.weight ?? 0) >= 260 },
    { key: 'draft', title: 'Draft horses', horseFn: h => h.is_draft, guestFn: g => (g.weight ?? 0) >= 220 },
  ]

  type DepthCardData = {
    key: string; title: string
    total: number; available: number
    outToday: { name: string; reason: string }[]
    guestsNow: number; isWarn: boolean
    horses: DbHorse[]
  }

  const depthCards: DepthCardData[] = DEPTH_CARD_DEFS.map(def => {
    const inCat = herd.filter(def.horseFn)
    const avail = inCat.filter(isHorseAvailable)
    const out = inCat.filter(h => !isHorseAvailable(h)).flatMap(h => {
      const r = getFlagReason(h)
      return r ? [{ name: h.name, reason: r }] : []
    })
    const gNow = onPropertyToday.filter(def.guestFn).length
    return {
      key: def.key, title: def.title,
      total: inCat.length, available: avail.length,
      outToday: out, guestsNow: gNow,
      isWarn: avail.length <= 3 || gNow > avail.length,
      horses: inCat,
    }
  })

  const sizeWeightCards = depthCards.filter(c => ['kids', 'w200', 'w220', 'w260', 'draft'].includes(c.key))
  const levelCards = depthCards.filter(c => c.key.startsWith('lvl_'))

  const renderDepthCard = (card: DepthCardData) => {
    const isSelected = selectedCard === card.key
    return (
      <div
        key={card.key}
        onClick={() => setSelectedCard(isSelected ? null : card.key)}
        style={{
          padding: '10px 12px',
          background: card.isWarn ? '#fffbeb' : 'var(--color-surface)',
          border: `1px solid ${card.isWarn ? '#fcd34d' : 'var(--color-border)'}`,
          outline: isSelected ? '2px solid var(--color-accent)' : 'none',
          borderRadius: 'var(--radius-lg)',
          cursor: 'pointer',
          userSelect: 'none' as const,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4, marginBottom: 6 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>{card.title}</div>
          {card.isWarn && (
            <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 999, background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d', fontWeight: 700, whiteSpace: 'nowrap' as const }}>⚠ thin</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 6 }}>
          <span style={{ fontSize: 28, fontWeight: 700, lineHeight: 1, color: card.isWarn ? '#92400e' : 'var(--color-text)' }}>{card.available}</span>
          <span style={{ fontSize: 11, color: 'var(--color-text-3)' }}>/ {card.total} avail</span>
        </div>
        <div style={{ height: 3, background: 'var(--color-border)', borderRadius: 2, overflow: 'hidden', marginBottom: 6 }}>
          <div style={{ height: '100%', width: card.total > 0 ? `${Math.round((card.available / card.total) * 100)}%` : '0%', background: '#16a34a', borderRadius: 2 }} />
        </div>
        <div style={{ fontSize: 10, color: 'var(--color-text-3)', display: 'flex', gap: 6, flexWrap: 'wrap' as const }}>
          <span>{card.guestsNow} guest{card.guestsNow !== 1 ? 's' : ''} here</span>
          {card.outToday.length > 0
            ? <span style={{ color: '#dc2626', fontWeight: 600 }}>{card.outToday.length} out</span>
            : <span style={{ opacity: 0.6 }}>none out</span>
          }
        </div>
      </div>
    )
  }

  // ────────────────────────────────────────────────────────────────────────────

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
          {/* ── Section 0: Herd Depth ── */}
          <div style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 12 }}>Herd Depth</div>

            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-3)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 8 }}>Size &amp; weight</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10, alignItems: 'start', marginBottom: 16 }}>
              {sizeWeightCards.map(renderDepthCard)}
            </div>

            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-3)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 8 }}>Rider level</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10, alignItems: 'start', marginBottom: selectedCard ? 16 : 0 }}>
              {levelCards.map(renderDepthCard)}
            </div>

            {selectedCard && (() => {
              const card = depthCards.find(c => c.key === selectedCard)!
              return (
                <div ref={detailRef} style={{ padding: '14px 16px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{card.title}</div>
                    <button onClick={() => setSelectedCard(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--color-text-3)', padding: '2px 4px' }}>Close ✕</button>
                  </div>
                  {card.outToday.length > 0 && (
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-3)', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 6 }}>Out today</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 6 }}>
                        {card.outToday.map(o => (
                          <span key={o.name} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5', fontWeight: 600 }}>
                            {o.name} · {o.reason}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-3)', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 6 }}>Available ({card.available})</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 6 }}>
                      {card.horses.filter(isHorseAvailable).map(h => (
                        <span key={h.name} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: 'var(--color-bg)', color: 'var(--color-text-2)', border: '1px solid var(--color-border)', fontWeight: 500 }}>
                          {h.name}
                        </span>
                      ))}
                      {card.horses.filter(isHorseAvailable).length === 0 && (
                        <span style={{ fontSize: 11, color: 'var(--color-text-3)' }}>None available today</span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })()}
          </div>

          {/* ── Herd Load ── */}
          {herdLoadDays !== null && herdLoadDays.length > 0 && (() => {
            const todayD = herdLoadDays[herdLoadDays.length - 1]
            const maxTotal = Math.max(...herdLoadDays.map(d => d.single + d.doubled + d.tripled + d.unused), 1)
            const parts: string[] = [`${todayD.single} single`]
            if (todayD.doubled > 0) parts.push(`${todayD.doubled} doubled`)
            if (todayD.tripled > 0) parts.push(`${todayD.tripled} tripled`)
            parts.push(`${todayD.unused} unused`)
            return (
              <div style={{ marginBottom: 28 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 12 }}>Herd Load</div>
                <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>

                  {/* Collapsed header — always visible */}
                  <div
                    onClick={() => { setHerdLoadOpen(v => !v); setHerdLoadSelIdx(null) }}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', cursor: 'pointer', userSelect: 'none' as const }}
                  >
                    <span style={{ fontSize: 13, color: 'var(--color-text-2)' }}>Today: {parts.join(' · ')}</span>
                    <span style={{ fontSize: 11, color: 'var(--color-text-3)', flexShrink: 0 }}>{herdLoadOpen ? '▾' : '▸'}</span>
                  </div>

                  {/* Expanded content */}
                  {herdLoadOpen && (
                    <div style={{ padding: '0 14px 14px', borderTop: '1px solid var(--color-border)' }}>

                      {/* Legend */}
                      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' as const, marginBottom: 8, marginTop: 12 }}>
                        {[
                          { color: '#4ade80', label: '1 rider' },
                          { color: '#fb923c', label: '2 riders' },
                          { color: '#ef4444', label: '3+ riders' },
                          { color: 'var(--color-border)', label: 'Unused' },
                        ].map(({ color, label }) => (
                          <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--color-text-3)' }}>
                            <span style={{ width: 8, height: 8, borderRadius: 2, background: color, display: 'inline-block', flexShrink: 0 }} />
                            {label}
                          </span>
                        ))}
                      </div>

                      {/* Stacked bar chart */}
                      <div style={{ display: 'flex', alignItems: 'flex-end', height: 64, gap: 1, marginBottom: 4 }}>
                        {herdLoadDays.map((d, i) => {
                          const total = d.single + d.doubled + d.tripled + d.unused
                          const h = (n: number) => `${Math.round((n / maxTotal) * 64)}px`
                          const isSel = herdLoadSelIdx === i
                          return (
                            <div
                              key={d.date}
                              title={`${fmtDay(d.date)}: ${d.single}+${d.doubled}+${d.tripled} used, ${d.unused} unused`}
                              onClick={() => setHerdLoadSelIdx(isSel ? null : i)}
                              style={{ flex: 1, display: 'flex', flexDirection: 'column-reverse' as const, height: `${Math.round((total / maxTotal) * 64)}px`, cursor: 'pointer', outline: isSel ? '1px solid var(--color-accent)' : 'none', borderRadius: 1 }}
                            >
                              {d.single  > 0 && <div style={{ height: h(d.single),  background: '#4ade80', minHeight: 1, flexShrink: 0 }} />}
                              {d.doubled > 0 && <div style={{ height: h(d.doubled), background: '#fb923c', minHeight: 1, flexShrink: 0 }} />}
                              {d.tripled > 0 && <div style={{ height: h(d.tripled), background: '#ef4444', minHeight: 1, flexShrink: 0 }} />}
                              {d.unused  > 0 && <div style={{ height: h(d.unused),  background: 'var(--color-border)', minHeight: 1, flexShrink: 0 }} />}
                            </div>
                          )
                        })}
                      </div>

                      {/* X-axis date labels at ~7-day intervals */}
                      <div style={{ display: 'flex', marginBottom: herdLoadSelIdx !== null ? 8 : 0 }}>
                        {herdLoadDays.map((d, i) => (
                          <div key={d.date} style={{ flex: 1, textAlign: 'center' as const, fontSize: 8, color: 'var(--color-text-3)', overflow: 'hidden', whiteSpace: 'nowrap' as const }}>
                            {(i === 0 || i === 6 || i === 13 || i === 20 || i === 27 || i === herdLoadDays.length - 1) ? fmtDay(d.date) : ''}
                          </div>
                        ))}
                      </div>

                      {/* Selected day detail */}
                      {herdLoadSelIdx !== null && (() => {
                        const sel = herdLoadDays[herdLoadSelIdx]
                        return (
                          <div style={{ fontSize: 11, color: 'var(--color-text-2)', padding: '6px 8px', background: 'var(--color-bg)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
                            <span style={{ fontWeight: 600, marginRight: 6 }}>{fmtDay(sel.date)}:</span>
                            {sel.single} single · {sel.doubled} doubled{sel.tripled > 0 ? ` · ${sel.tripled} tripled` : ''} · {sel.unused} unused
                          </div>
                        )
                      })()}

                      {/* No-suggestion summary */}
                      {herdLoadNoSugTotal > 0 ? (
                        <div style={{ marginTop: 10, fontSize: 11, color: 'var(--color-text-3)' }}>
                          Assign All couldn&apos;t suggest a horse for {herdLoadNoSugTotal} guest{herdLoadNoSugTotal !== 1 ? 's' : ''} in the last 30 days:&nbsp;
                          {herdLoadNoSug.map((n, i) => (
                            <span key={n.date}>{i > 0 ? ' · ' : ''}{fmtDay(n.date)}: {n.count}</span>
                          ))}
                        </div>
                      ) : (
                        <p style={{ marginTop: 10, fontSize: 11, color: 'var(--color-text-3)', margin: '10px 0 0' }}>No unmatched guests in Assign All for the last 30 days.</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })()}

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
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 60px 60px 50px 1fr', gap: 8, padding: '8px 14px', borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg)' }}>
                {['Horse', 'Avg wt', 'Max wt', 'Level', 'Gender'].map(col => (
                  <div key={col} style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-3)', textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>{col}</div>
                ))}
              </div>
              {riderTypeStats.map((s, i) => {
                const avgWt  = avgOf(s.weights)
                const maxWt  = maxOf(s.weights)
                const topLvl = topOf(s.levels)
                const gSplit = genderSplitOf(s.genders)
                return (
                  <div
                    key={s.name}
                    onClick={onSelectHorse ? () => onSelectHorse(s.horse) : undefined}
                    style={{ display: 'grid', gridTemplateColumns: '1fr 60px 60px 50px 1fr', gap: 8, padding: '9px 14px', borderBottom: i < riderTypeStats.length - 1 ? '1px solid var(--color-border)' : 'none', cursor: onSelectHorse ? 'pointer' : 'default', alignItems: 'center' }}
                  >
                    <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--color-text-2)' }}>{avgWt != null ? `${avgWt} lb` : '—'}</div>
                    <div style={{ fontSize: 12, color: 'var(--color-text-2)' }}>{maxWt != null ? `${maxWt} lb` : '—'}</div>
                    <div><span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 999, background: 'var(--color-accent-bg)', color: 'var(--color-accent)', fontWeight: 600 }}>{topLvl}</span></div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-2)' }}>{gSplit}</div>
                  </div>
                )
              })}
              {riderTypeStats.length === 0 && <div style={{ padding: 20, textAlign: 'center', fontSize: 12, color: 'var(--color-text-3)' }}>No data yet</div>}
            </div>
          </div>

          {/* ── Section 4: Flags to Watch ── */}
          <div style={{ marginBottom: 28 }}>
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

          {/* ── Section 5: Idle Streaks ── */}
          <div style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 12 }}>Idle Streaks</div>
            <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
              {displayedIdleRows.length === 0 ? (
                <div style={{ padding: 20, textAlign: 'center', fontSize: 12, color: 'var(--color-text-3)' }}>No horse data</div>
              ) : (
                <>
                  {displayedIdleRows.map((row, i) => (
                    <div
                      key={row.horse.name}
                      style={{ padding: '9px 14px', borderBottom: i < displayedIdleRows.length - 1 ? '1px solid var(--color-border)' : 'none', display: 'flex', alignItems: 'center', gap: 10, background: (!row.workingNow && row.idleDays != null && row.idleDays >= 7) ? '#fffbeb' : 'transparent' }}
                    >
                      <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 600, fontSize: 13 }}>{row.horse.name}</span>
                        {row.activeFlags.map(f => (
                          <span key={f.id} style={{ fontSize: 10, padding: '1px 5px', borderRadius: 999, background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5', fontWeight: 600 }}>
                            {FLAG_LABELS[f.flag_type] ?? f.flag_type}
                          </span>
                        ))}
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 600, flexShrink: 0, whiteSpace: 'nowrap', color: row.workingNow ? 'var(--color-success)' : (row.idleDays != null && row.idleDays >= 7) ? '#d97706' : 'var(--color-text-2)' }}>
                        {row.workingNow ? 'Working now' : row.idleDays === null ? 'No rides yet' : row.idleDays === 0 ? 'Today' : `${row.idleDays} day${row.idleDays !== 1 ? 's' : ''}`}
                      </div>
                    </div>
                  ))}
                  {idleRows.length > IDLE_SHOW && (
                    <div style={{ padding: '10px 14px', textAlign: 'center', borderTop: '1px solid var(--color-border)' }}>
                      <button onClick={() => setShowAllIdle(v => !v)} style={{ fontSize: 12, color: 'var(--color-accent)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                        {showAllIdle ? 'Show less ↑' : `Show all ${idleRows.length} ↓`}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* ── Section 6: Top 10 · Last 60 Days ── */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 12 }}>Top 10 · Last 60 Days</div>
            <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
              {top10Last60.length === 0 ? (
                <div style={{ padding: 20, textAlign: 'center', fontSize: 12, color: 'var(--color-text-3)' }}>No assignments in the last 60 days</div>
              ) : top10Last60.map((s, i) => {
                const pct = Math.round((s.count / max60) * 100)
                return (
                  <div
                    key={s.name}
                    onClick={onSelectHorse ? () => onSelectHorse(statsMap[s.name]?.horse) : undefined}
                    style={{ padding: '10px 14px', borderBottom: i < top10Last60.length - 1 ? '1px solid var(--color-border)' : 'none', cursor: onSelectHorse ? 'pointer' : 'default', display: 'flex', alignItems: 'center', gap: 10 }}
                  >
                    <div style={{ width: 18, fontSize: 11, color: 'var(--color-text-muted)', flexShrink: 0, fontWeight: 600, textAlign: 'right' }}>{i + 1}</div>
                    <div style={{ width: 110, fontWeight: 600, fontSize: 13, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</div>
                    <div style={{ flex: 1, height: 8, background: 'var(--color-bg)', borderRadius: 4, overflow: 'hidden', border: '1px solid var(--color-border)' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: 'var(--color-accent)', borderRadius: 4 }} />
                    </div>
                    <div style={{ width: 28, fontSize: 12, color: 'var(--color-text-3)', textAlign: 'right', flexShrink: 0 }}>{s.count}</div>
                  </div>
                )
              })}
            </div>
          </div>
          {/* ── Section 7: Draft Usage ── */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 4 }}>Draft Usage</div>
            <p style={{ fontSize: 11, color: 'var(--color-text-3)', marginBottom: 12 }}>
              Before / after Sep 10, 2026 (Wave 5) · Draft preference starts at 200 lbs and reaches full strength at 260 lbs.
            </p>
            <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, padding: '8px 14px', borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg)' }}>
                {['Weight', 'Before Sep 10', 'After Sep 10'].map(col => (
                  <div key={col} style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-3)', textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>{col}</div>
                ))}
              </div>
              {draftBandRows.map((row, i) => (
                <div key={row.label} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, padding: '9px 14px', borderBottom: i < draftBandRows.length - 1 ? '1px solid var(--color-border)' : 'none', alignItems: 'center' }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{row.label} lbs</div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-2)' }}>{draftCell(row.before)}</div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-2)' }}>{draftCell(row.after)}</div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
