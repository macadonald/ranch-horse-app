'use client'
import { useState, useEffect } from 'react'
import { WEIGHT_BANDS, getWeightBand } from '@/lib/weightBands'
import { holidaysInRange, schoolBreakFor } from '@/lib/calendar'

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
  assigned_at?: string | null; removed_at?: string | null
}

export type AnalyticsGuest = {
  id: string; name: string
  check_in_date: string; check_out_date: string
  age: number; weight: number; gender: string; riding_level: string
  checked_out?: boolean; checked_out_at?: string | null
  repeat_guest?: boolean
  room_number?: string | null
  horse_assignments?: AnalyticsAssignment[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function stayEndOf(g: AnalyticsGuest): string | null {
  if (g.check_out_date) return g.check_out_date
  if (g.checked_out_at) return g.checked_out_at.slice(0, 10)
  return null
}

function nightsBetween(a: string, b: string): number {
  return Math.round(
    (new Date(b + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()) / 86400000
  )
}

function isUsable(g: AnalyticsGuest): boolean {
  const end = stayEndOf(g)
  if (!g.check_in_date || !end) return false
  const n = nightsBetween(g.check_in_date, end)
  return n >= 1 && n <= 21
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function getSundayStr(date: Date): string {
  const d = new Date(date)
  d.setDate(d.getDate() - d.getDay())
  return toDateStr(d)
}

function weekLabel(sundayStr: string): string {
  const d = new Date(sundayStr + 'T12:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function monthLabel(yyyyMM: string): string {
  const d = new Date(yyyyMM + '-01T12:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

// ─── Color constants ──────────────────────────────────────────────────────────

const WT_COLORS = ['#818cf8', '#6366f1', '#4f46e5', '#7c3aed', '#6d28d9', '#5b21b6', '#9ca3af']

const AGE_SEGS_DEF = [
  { label: 'Kids (<13)',     color: '#a78bfa' },
  { label: 'Teens (13–17)', color: '#34d399' },
  { label: 'Adults (18–64)',color: '#60a5fa' },
  { label: '65+',           color: '#fbbf24' },
  { label: 'No age',        color: '#d1d5db' },
]

const STAY_BUCKET_COLORS = ['#bae6fd', '#38bdf8', '#0284c7', '#075985']

type PartyType = 'Solo' | 'Couple' | 'Parent & adult child' | 'Friends / siblings' | 'Unclear' | 'Family' | 'Group'
const PARTY_TYPES: PartyType[] = ['Solo', 'Couple', 'Parent & adult child', 'Friends / siblings', 'Unclear', 'Family', 'Group']
const PARTY_COLORS: Record<PartyType, string> = {
  Solo:                   '#6366f1',
  Couple:                 '#ec4899',
  'Parent & adult child': '#f59e0b',
  'Friends / siblings':   '#10b981',
  Unclear:                '#d1d5db',
  Family:                 '#f97316',
  Group:                  '#06b6d4',
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

// ─── Stacked bar helper ───────────────────────────────────────────────────────

function StackedBar({ segments, total, height = 12 }: {
  segments: { color: string; count: number }[]
  total: number
  height?: number
}) {
  if (total === 0) return <div style={{ height, background: 'var(--color-border)', borderRadius: 3 }} />
  return (
    <div style={{ display: 'flex', height, borderRadius: 3, overflow: 'hidden', background: 'var(--color-border)' }}>
      {segments.map((s, i) => {
        const pct = (s.count / total) * 100
        if (pct <= 0) return null
        return <div key={i} style={{ width: `${pct}%`, background: s.color }} />
      })}
    </div>
  )
}

// ─── GuestAnalyticsPanel ─────────────────────────────────────────────────────

export function GuestAnalyticsPanel({ guests, allGuests, today, onBack }: {
  guests: AnalyticsGuest[]
  allGuests?: AnalyticsGuest[]
  today: string
  onBack?: () => void
}) {
  const [showAllWeeks, setShowAllWeeks] = useState(false)
  const [showWeather, setShowWeather] = useState(false)
  const [showAllWeatherWeeks, setShowAllWeatherWeeks] = useState(false)
  const [weatherMap, setWeatherMap] = useState<Record<string, { highF: number | null; rainIn: number | null }>>({})
  const [weatherReady, setWeatherReady] = useState(false)
  const [weatherFailed, setWeatherFailed] = useState(false)

  useEffect(() => {
    const dates = guests.map(g => g.check_in_date).filter((d): d is string => !!d)
    const wStart = (() => {
      if (!dates.length) return today
      const earliest = dates.reduce((a, b) => (a < b ? a : b))
      const cap = new Date(today + 'T12:00:00')
      cap.setFullYear(cap.getFullYear() - 2)
      const capStr = toDateStr(cap)
      return earliest > capStr ? earliest : capStr
    })()
    const wEndDate = new Date(today + 'T12:00:00')
    wEndDate.setDate(wEndDate.getDate() + 7)
    const wEnd = toDateStr(wEndDate)
    fetch(`/api/weather?start=${wStart}&end=${wEnd}`)
      .then(r => r.json())
      .then((data: { days?: { date: string; highF: number | null; rainIn: number | null }[]; errors?: string[] }) => {
        const map: Record<string, { highF: number | null; rainIn: number | null }> = {}
        for (const d of (data.days || [])) map[d.date] = { highF: d.highF, rainIn: d.rainIn }
        setWeatherMap(map)
        if ((data.days?.length ?? 0) === 0 && (data.errors?.length ?? 0) > 0) setWeatherFailed(true)
        setWeatherReady(true)
      })
      .catch(() => { setWeatherFailed(true); setWeatherReady(true) })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Only guests with at least one horse assignment
  const gwa = guests.filter(g => g.horse_assignments && g.horse_assignments.length > 0)
  const n = gwa.length

  // 1. Overview
  const activeCount = (allGuests ?? guests).filter(g => !g.checked_out && (!g.check_out_date || g.check_out_date >= today)).length
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
  const wtRanges = [
    ...WEIGHT_BANDS.map(b => ({ label: b.label, count: 0 })),
    { label: 'No weight', count: 0 },
  ]
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
    const band = getWeightBand((g.weight as unknown as number | null))
    if (band) {
      const idx = wtRanges.findIndex(r => r.label === band.label)
      if (idx !== -1) wtRanges[idx].count++
    } else {
      wtRanges[wtRanges.length - 1].count++
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

  // 4. Busiest checkout days — DOW
  const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const dowCounts: Record<number, number> = {}
  const womCounts: Record<number, number> = {}
  gwa.forEach(g => {
    if (!g.check_out_date) return
    const d = new Date(g.check_out_date + 'T12:00:00')
    const dow = d.getDay(); dowCounts[dow] = (dowCounts[dow] || 0) + 1
    const wom = Math.ceil(d.getDate() / 7); womCounts[wom] = (womCounts[wom] || 0) + 1
  })
  const sortedDays = Object.entries(dowCounts).sort(([, a], [, b]) => b - a).map(([d, c]) => ({ label: DOW[+d], count: c }))
  const maxDay = Math.max(...sortedDays.map(d => d.count), 1)

  // WOM per-day normalization
  const womCalDays: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  const allCODates = gwa.map(g => g.check_out_date).filter(Boolean) as string[]
  if (allCODates.length > 0) {
    const earliestCO = allCODates.reduce((a, b) => a < b ? a : b)
    const latestCO   = allCODates.reduce((a, b) => a > b ? a : b)
    const cur = new Date(earliestCO.slice(0, 7) + '-01T12:00:00')
    const endM = new Date(latestCO.slice(0, 7) + '-01T12:00:00')
    while (cur <= endM) {
      const daysInMonth = new Date(cur.getFullYear(), cur.getMonth() + 1, 0).getDate()
      for (let day = 1; day <= daysInMonth; day++) {
        const wom = Math.ceil(day / 7)
        womCalDays[wom] = (womCalDays[wom] || 0) + 1
      }
      cur.setMonth(cur.getMonth() + 1)
    }
  }
  const sortedWeeksPerDay = [1, 2, 3, 4, 5]
    .filter(w => (womCounts[w] || 0) > 0 || womCalDays[w] > 0)
    .map(w => ({
      label: `Week ${w}`,
      count: womCounts[w] || 0,
      calDays: womCalDays[w] || 0,
      perDay: womCalDays[w] > 0 ? (womCounts[w] || 0) / womCalDays[w] : 0,
    }))
    .sort((a, b) => b.perDay - a.perDay)
  const maxPerDay = Math.max(...sortedWeeksPerDay.map(w => w.perDay), 0.001)

  // 5. Length of stay — usable guests
  const usableGuests = guests.filter(isUsable)
  const stays: number[] = usableGuests.map(g => nightsBetween(g.check_in_date, stayEndOf(g)!))
  const avgStay = stays.length ? (stays.reduce((a, b) => a + b, 0) / stays.length).toFixed(1) : null
  const stayCounts: Record<number, number> = {}
  stays.forEach(s => { stayCounts[s] = (stayCounts[s] || 0) + 1 })
  const mostCommonStay = stays.length ? Object.entries(stayCounts).sort(([, a], [, b]) => b - a)[0] : null

  // Stay by month
  const stayByMonth: Record<string, number[]> = {}
  usableGuests.forEach(g => {
    const mm = g.check_in_date.slice(0, 7)
    if (!stayByMonth[mm]) stayByMonth[mm] = []
    stayByMonth[mm].push(nightsBetween(g.check_in_date, stayEndOf(g)!))
  })
  const sortedStayMonths = Object.keys(stayByMonth).sort()
  function stayBucketOf(n: number): 0 | 1 | 2 | 3 {
    if (n <= 2) return 0
    if (n <= 4) return 1
    if (n <= 6) return 2
    return 3
  }
  const STAY_BUCKETS = ['1–2 nights', '3–4 nights', '5–6 nights', '7+ nights']

  // 6. Repeat vs new (all guests)
  const repeatCount = guests.filter(g => g.repeat_guest === true).length
  const guestTotal  = guests.length
  const newCount    = guestTotal - repeatCount
  const repeatPct   = guestTotal > 0 ? Math.round((repeatCount / guestTotal) * 100) : 0
  const newPct      = guestTotal > 0 ? 100 - repeatPct : 0

  // Repeat vs First-time comparison (usable guests)
  const repeatUsable = usableGuests.filter(g => g.repeat_guest === true)
  const newUsable    = usableGuests.filter(g => g.repeat_guest !== true)

  function avgOf(arr: number[]): string {
    if (!arr.length) return '—'
    return (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1)
  }
  function mostCommonStr(arr: string[]): string {
    if (!arr.length) return '—'
    const c: Record<string, number> = {}
    arr.forEach(v => { c[v] = (c[v] || 0) + 1 })
    return Object.entries(c).sort(([, a], [, b]) => b - a)[0][0]
  }

  function comparisonStats(grp: AnalyticsGuest[]) {
    const ns   = grp.map(g => nightsBetween(g.check_in_date, stayEndOf(g)!))
    const wts  = grp.filter(g => g.weight > 0).map(g => g.weight)
    const ages = grp.filter(g => g.age > 0).map(g => g.age)
    const lvls = grp.filter(g => g.riding_level).map(g => g.riding_level)
    const incompPct = grp.length > 0
      ? Math.round((grp.filter(g => (g.horse_assignments || []).some(a => a.incompatible)).length / grp.length) * 100)
      : 0
    return {
      avgNights: avgOf(ns),
      avgWeight: avgOf(wts),
      avgAge:    avgOf(ages),
      topLevel:  mostCommonStr(lvls),
      incompPct,
    }
  }
  const repeatStats = comparisonStats(repeatUsable)
  const newStats    = comparisonStats(newUsable)

  // 7. Guest Mix by Week
  const usableForWeek = guests.filter(g => g.check_in_date && stayEndOf(g))
  const weekMap: Record<string, {
    wtSegs: number[]   // indexed by WEIGHT_BANDS + "No weight"
    ageSegs: number[]  // [Kids, Teens, Adults, 65+, NoAge]
    firstTime: number
    repeat: number
  }> = {}

  usableForWeek.forEach(g => {
    const cin  = new Date(g.check_in_date + 'T12:00:00')
    const cout = new Date(stayEndOf(g)! + 'T12:00:00')
    // Enumerate each week the guest overlaps
    const startSun = getSundayStr(cin)
    let cur = new Date(startSun + 'T12:00:00')
    while (cur <= cout) {
      const key = toDateStr(cur)
      if (!weekMap[key]) weekMap[key] = { wtSegs: Array(7).fill(0), ageSegs: Array(5).fill(0), firstTime: 0, repeat: 0 }
      const wk = weekMap[key]
      // weight bucket
      const band = getWeightBand(g.weight as unknown as number | null)
      if (band) {
        const idx = WEIGHT_BANDS.findIndex(b => b.key === band.key)
        if (idx !== -1) wk.wtSegs[idx]++
      } else {
        wk.wtSegs[6]++
      }
      // age bucket
      if (!g.age) {
        wk.ageSegs[4]++
      } else if (g.age < 13) {
        wk.ageSegs[0]++
      } else if (g.age < 18) {
        wk.ageSegs[1]++
      } else if (g.age < 65) {
        wk.ageSegs[2]++
      } else {
        wk.ageSegs[3]++
      }
      // first vs repeat
      if (g.repeat_guest === true) wk.repeat++; else wk.firstTime++
      cur.setDate(cur.getDate() + 7)
    }
  })

  const allWeekKeys = Object.keys(weekMap).sort().reverse()
  const SHOW_WEEKS = 12
  const visibleWeekKeys = showAllWeeks ? allWeekKeys : allWeekKeys.slice(0, SHOW_WEEKS)
  const maxWeekTotal = Math.max(...allWeekKeys.map(k => {
    const wk = weekMap[k]
    return wk.wtSegs.reduce((a, b) => a + b, 0)
  }), 1)

  // 8. Party Composition
  const partyMap: Record<string, AnalyticsGuest[]> = {}
  guests.forEach(g => {
    if (!g.room_number || !g.check_in_date) return
    const key = `${g.room_number.trim()}__${g.check_in_date}`
    if (!partyMap[key]) partyMap[key] = []
    partyMap[key].push(g)
  })

  function classifyParty(members: AnalyticsGuest[]): PartyType {
    if (members.length === 1) return 'Solo'
    const hasKnownMinor = members.some(m => m.age > 0 && m.age < 18)
    if (hasKnownMinor) return 'Family'
    if (members.length >= 3) return 'Group'
    // Exactly 2 adults
    const [a, b] = members
    const aAge = a.age > 0 ? a.age : null
    const bAge = b.age > 0 ? b.age : null
    const aGender = (a.gender || '').toLowerCase().trim()
    const bGender = (b.gender || '').toLowerCase().trim()
    if (aAge === null || bAge === null || !aGender || !bGender) return 'Unclear'
    const ageDiff = Math.abs(aAge - bAge)
    if (ageDiff >= 18) return 'Parent & adult child'
    if (aGender !== bGender && ageDiff <= 15) return 'Couple'
    return 'Friends / siblings'
  }

  const partyByMonth: Record<string, Record<PartyType, number>> = {}
  const partyCountsAll = Object.fromEntries(PARTY_TYPES.map(pt => [pt, 0])) as Record<PartyType, number>
  const partySizes: number[] = []

  Object.values(partyMap).forEach(members => {
    const type = classifyParty(members)
    const mm = members[0].check_in_date.slice(0, 7)
    if (!partyByMonth[mm]) partyByMonth[mm] = Object.fromEntries(PARTY_TYPES.map(pt => [pt, 0])) as Record<PartyType, number>
    partyByMonth[mm][type]++
    partyCountsAll[type]++
    partySizes.push(members.length)
  })

  const sortedPartyMonths = Object.keys(partyByMonth).sort()
  const totalParties = partySizes.length
  const avgPartySize = totalParties > 0 ? (partySizes.reduce((a, b) => a + b, 0) / totalParties).toFixed(1) : '—'
  const partyGuestsWithRoom = guests.filter(g => g.room_number && g.check_in_date).length

  // ── Weather helpers ──────────────────────────────────────────────────────────

  function weekWeather(sundayKey: string): { avgHigh: number | null; rainDays: number | null } {
    let sum = 0, count = 0, rainDays = 0, hasData = false
    for (let i = 0; i < 7; i++) {
      const d = new Date(sundayKey + 'T12:00:00')
      d.setDate(d.getDate() + i)
      const w = weatherMap[toDateStr(d)]
      if (w !== undefined) {
        hasData = true
        if (w.highF != null) { sum += w.highF; count++ }
        if ((w.rainIn ?? 0) >= 0.05) rainDays++
      }
    }
    if (!hasData) return { avgHigh: null, rainDays: null }
    return { avgHigh: count > 0 ? Math.round(sum / count) : null, rainDays }
  }

  function monthWeather(yyyyMM: string): { avgHigh: number | null; rainDays: number } {
    const [y, m] = yyyyMM.split('-').map(Number)
    const daysInMonth = new Date(y, m, 0).getDate()
    let sum = 0, count = 0, rainDays = 0
    for (let day = 1; day <= daysInMonth; day++) {
      const w = weatherMap[`${yyyyMM}-${String(day).padStart(2, '0')}`]
      if (w?.highF != null) { sum += w.highF; count++ }
      if ((w?.rainIn ?? 0) >= 0.05) rainDays++
    }
    return { avgHigh: count > 0 ? Math.round(sum / count) : null, rainDays }
  }

  function weekCalendarText(sundayKey: string): string {
    const endDate = new Date(sundayKey + 'T12:00:00')
    endDate.setDate(endDate.getDate() + 6)
    const weekEnd = toDateStr(endDate)
    const parts: string[] = []
    for (const h of holidaysInRange(sundayKey, weekEnd)) parts.push(h.name)
    const breaks = new Set<string>()
    for (let i = 0; i < 7; i++) {
      const d = new Date(sundayKey + 'T12:00:00')
      d.setDate(d.getDate() + i)
      const br = schoolBreakFor(toDateStr(d))
      if (br) breaks.add(br.label)
    }
    breaks.forEach(b => parts.push(b))
    return parts.length > 0 ? parts.join(', ') : '—'
  }

  // ── This week ────────────────────────────────────────────────────────────────

  const thisWeekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today + 'T12:00:00')
    d.setDate(d.getDate() + i)
    return toDateStr(d)
  })

  const next14End = (() => {
    const d = new Date(today + 'T12:00:00')
    d.setDate(d.getDate() + 13)
    return toDateStr(d)
  })()

  const upcomingEvents = (() => {
    const events: string[] = []
    for (const h of holidaysInRange(today, next14End)) {
      const days = Math.round(
        (new Date(h.date + 'T12:00:00').getTime() - new Date(today + 'T12:00:00').getTime()) / 86400000
      )
      events.push(days === 0 ? `🎉 ${h.name} today` : `🎉 ${h.name} in ${days} day${days !== 1 ? 's' : ''}`)
    }
    const seenBreaks = new Set<string>()
    for (let i = 0; i < 14; i++) {
      const d = new Date(today + 'T12:00:00')
      d.setDate(d.getDate() + i)
      const br = schoolBreakFor(toDateStr(d))
      if (br && !seenBreaks.has(br.label)) {
        seenBreaks.add(br.label)
        const suffix = br.approx ? ' (approx.)' : ''
        events.push(i === 0 ? `🏫 ${br.label}${suffix} now` : `🏫 ${br.label}${suffix}`)
      }
    }
    return events
  })()

  const backBtn = { fontSize: 13, fontWeight: 600, color: 'var(--color-text-2)' as const, background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '999px', padding: '6px 14px', cursor: 'pointer' as const, marginBottom: 14, display: 'inline-block' }
  const sec = { background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: '14px 16px', marginBottom: 14 }
  const subLabel = { fontSize: 12, fontWeight: 600 as const, color: 'var(--color-text-2)' as const, marginBottom: 6, marginTop: 14 as const }
  const legendDot = (color: string, label: string) => (
    <span key={label} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--color-text-3)' }}>
      <span style={{ width: 8, height: 8, borderRadius: 2, background: color, display: 'inline-block', flexShrink: 0 }} />
      {label}
    </span>
  )

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
          { label: 'Guests here now',       value: activeCount },
          { label: 'Horses ever assigned', value: assignedHorseNames.size },
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

      {/* 3. Guest Mix by Week */}
      <div style={sec}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Guest Mix by Week</div>
        <p style={{ fontSize: 11, color: 'var(--color-text-3)', marginBottom: 12 }}>
          Based on {usableForWeek.length} of {guests.length} guests with check-in and check-out dates
        </p>
        {visibleWeekKeys.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--color-text-3)' }}>Not enough data yet.</p>
        ) : (
          <>
            {/* Weight legend */}
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-2)', marginBottom: 6 }}>Weight</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 10px', marginBottom: 8 }}>
              {WEIGHT_BANDS.map((b, i) => legendDot(WT_COLORS[i], b.label))}
              {legendDot(WT_COLORS[6], 'No weight')}
            </div>
            {visibleWeekKeys.map(key => {
              const wk = weekMap[key]
              const wtTotal = wk.wtSegs.reduce((a, b) => a + b, 0)
              return (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                  <div style={{ width: 52, fontSize: 11, color: 'var(--color-text-3)', flexShrink: 0, textAlign: 'right' }}>{weekLabel(key)}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <StackedBar
                      segments={wk.wtSegs.map((count, i) => ({ color: WT_COLORS[i], count }))}
                      total={maxWeekTotal}
                      height={10}
                    />
                  </div>
                  <div style={{ width: 24, fontSize: 11, color: 'var(--color-text-3)', textAlign: 'right', flexShrink: 0 }}>{wtTotal}</div>
                </div>
              )
            })}

            {/* Age legend */}
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-2)', marginBottom: 6, marginTop: 14 }}>Age</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 10px', marginBottom: 8 }}>
              {AGE_SEGS_DEF.map(s => legendDot(s.color, s.label))}
            </div>
            {visibleWeekKeys.map(key => {
              const wk = weekMap[key]
              const ageTotal = wk.ageSegs.reduce((a, b) => a + b, 0)
              return (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                  <div style={{ width: 52, fontSize: 11, color: 'var(--color-text-3)', flexShrink: 0, textAlign: 'right' }}>{weekLabel(key)}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <StackedBar
                      segments={wk.ageSegs.map((count, i) => ({ color: AGE_SEGS_DEF[i].color, count }))}
                      total={maxWeekTotal}
                      height={10}
                    />
                  </div>
                  <div style={{ width: 24, fontSize: 11, color: 'var(--color-text-3)', textAlign: 'right', flexShrink: 0 }}>{ageTotal}</div>
                </div>
              )
            })}

            {/* First vs Repeat */}
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-2)', marginBottom: 6, marginTop: 14 }}>First-time vs Repeat</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 10px', marginBottom: 8 }}>
              {legendDot('#93c5fd', 'First-time')}
              {legendDot('#34d399', 'Repeat')}
            </div>
            {visibleWeekKeys.map(key => {
              const wk = weekMap[key]
              const frTotal = wk.firstTime + wk.repeat
              return (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                  <div style={{ width: 52, fontSize: 11, color: 'var(--color-text-3)', flexShrink: 0, textAlign: 'right' }}>{weekLabel(key)}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <StackedBar
                      segments={[
                        { color: '#93c5fd', count: wk.firstTime },
                        { color: '#34d399', count: wk.repeat },
                      ]}
                      total={maxWeekTotal}
                      height={10}
                    />
                  </div>
                  <div style={{ width: 24, fontSize: 11, color: 'var(--color-text-3)', textAlign: 'right', flexShrink: 0 }}>{frTotal}</div>
                </div>
              )
            })}

            {allWeekKeys.length > SHOW_WEEKS && (
              <button
                onClick={() => setShowAllWeeks(v => !v)}
                style={{ marginTop: 8, fontSize: 12, color: 'var(--color-accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                {showAllWeeks ? 'Show less' : `Show all ${allWeekKeys.length} weeks`}
              </button>
            )}
          </>
        )}
      </div>

      {/* 4. Flags to watch */}
      <div style={sec}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Flags to Watch</div>
        <p style={{ fontSize: 11, color: 'var(--color-text-3)', marginBottom: 12 }}>Horses with 3+ not a fit flags from different guests</p>
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

      {/* 5. Busiest checkout days */}
      <div style={sec}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Busiest Checkout Days</div>
        {sortedDays.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--color-text-3)' }}>Not enough data yet.</p>
        ) : (
          <>
            <div style={subLabel}>Day of week</div>
            {sortedDays.map(d => <AnalyticsBarRow key={d.label} label={d.label} count={d.count} max={maxDay} labelWidth={80} />)}
            {sortedWeeksPerDay.length > 0 && (
              <>
                <div style={{ ...subLabel, marginTop: 14 }}>Week of month <span style={{ fontWeight: 400, color: 'var(--color-text-3)' }}>(adjusted per day)</span></div>
                {sortedWeeksPerDay.map(w => {
                  const barPct = maxPerDay > 0 ? Math.max((w.perDay / maxPerDay) * 100, w.count > 0 ? 2 : 0) : 0
                  return (
                    <div key={w.label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                      <div style={{ width: 56, fontSize: 12, color: 'var(--color-text-2)', flexShrink: 0, textAlign: 'right' }}>{w.label}</div>
                      <div style={{ flex: 1, height: 14, background: 'var(--color-bg)', borderRadius: 3, overflow: 'hidden', border: '1px solid var(--color-border)' }}>
                        <div style={{ width: `${barPct}%`, height: '100%', background: 'var(--color-accent)', borderRadius: 3 }} />
                      </div>
                      <div style={{ width: 110, fontSize: 11, color: 'var(--color-text-3)', textAlign: 'right', flexShrink: 0 }}>
                        <span style={{ fontWeight: 600, color: 'var(--color-text-2)' }}>{w.perDay.toFixed(1)}/day</span>
                        <span style={{ marginLeft: 4 }}>· {w.count}</span>
                      </div>
                    </div>
                  )
                })}
                <p style={{ fontSize: 11, color: 'var(--color-text-3)', marginTop: 6 }}>Adjusted per day — week 5 only covers days 29–31.</p>
              </>
            )}
          </>
        )}
      </div>

      {/* 6. Length of stay */}
      <div style={sec}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Length of Stay</div>
        <p style={{ fontSize: 11, color: 'var(--color-text-3)', marginBottom: 12 }}>
          Based on {usableGuests.length} of {guests.length} guests with usable dates
        </p>
        {!avgStay ? (
          <p style={{ fontSize: 13, color: 'var(--color-text-3)' }}>Not enough data yet.</p>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
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

            {sortedStayMonths.length > 0 && (
              <>
                <div style={subLabel}>By check-in month</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 10px', marginBottom: 8 }}>
                  {STAY_BUCKETS.map((b, i) => legendDot(STAY_BUCKET_COLORS[i], b))}
                </div>
                {sortedStayMonths.map(mm => {
                  const ns = stayByMonth[mm]
                  const buckets = [0, 0, 0, 0]
                  ns.forEach(n => { buckets[stayBucketOf(n)]++ })
                  const avg = (ns.reduce((a, b) => a + b, 0) / ns.length).toFixed(1)
                  return (
                    <div key={mm} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                      <div style={{ width: 60, fontSize: 11, color: 'var(--color-text-3)', flexShrink: 0, textAlign: 'right' }}>{monthLabel(mm)}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <StackedBar
                          segments={buckets.map((count, i) => ({ color: STAY_BUCKET_COLORS[i], count }))}
                          total={ns.length}
                          height={10}
                        />
                      </div>
                      <div style={{ width: 60, fontSize: 11, color: 'var(--color-text-3)', textAlign: 'right', flexShrink: 0 }}>
                        <span style={{ fontWeight: 600, color: 'var(--color-text-2)' }}>{avg}n</span>
                        <span style={{ marginLeft: 3 }}>· {ns.length}</span>
                      </div>
                    </div>
                  )
                })}
              </>
            )}
          </>
        )}
      </div>

      {/* 7. Party Composition */}
      <div style={sec}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Party Composition</div>
        <p style={{ fontSize: 11, color: 'var(--color-text-3)', marginBottom: 4 }}>
          Based on {partyGuestsWithRoom} of {guests.length} guests with room number and check-in date
        </p>
        <p style={{ fontSize: 11, color: 'var(--color-text-3)', marginBottom: 12, fontStyle: 'italic' }}>
          Best-guess grouping from age and gender. Couple = two adults of different genders within 15 years; Parent &amp; adult child = 18+ year gap; Unclear = missing age or gender.
        </p>
        {totalParties === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--color-text-3)' }}>Not enough data yet.</p>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              {PARTY_TYPES.map(pt => (
                <div key={pt} style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '8px 12px', minWidth: 70, textAlign: 'center' }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: PARTY_COLORS[pt], margin: '0 auto 4px' }} />
                  <div style={{ fontSize: 16, fontWeight: 700, fontFamily: 'var(--font-display)' }}>{partyCountsAll[pt]}</div>
                  <div style={{ fontSize: 10, color: 'var(--color-text-3)' }}>{pt}</div>
                </div>
              ))}
              <div style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '8px 12px', minWidth: 70, textAlign: 'center' }}>
                <div style={{ fontSize: 16, fontWeight: 700, fontFamily: 'var(--font-display)' }}>{avgPartySize}</div>
                <div style={{ fontSize: 10, color: 'var(--color-text-3)' }}>avg size</div>
              </div>
            </div>

            {sortedPartyMonths.length > 0 && (
              <>
                <div style={subLabel}>By month</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 10px', marginBottom: 8 }}>
                  {PARTY_TYPES.map(pt => legendDot(PARTY_COLORS[pt], pt))}
                </div>
                {sortedPartyMonths.map(mm => {
                  const row = partyByMonth[mm]
                  const total = PARTY_TYPES.reduce((s, pt) => s + row[pt], 0)
                  return (
                    <div key={mm} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                      <div style={{ width: 60, fontSize: 11, color: 'var(--color-text-3)', flexShrink: 0, textAlign: 'right' }}>{monthLabel(mm)}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <StackedBar
                          segments={PARTY_TYPES.map(pt => ({ color: PARTY_COLORS[pt], count: row[pt] }))}
                          total={total}
                          height={10}
                        />
                      </div>
                      <div style={{ width: 24, fontSize: 11, color: 'var(--color-text-3)', textAlign: 'right', flexShrink: 0 }}>{total}</div>
                    </div>
                  )
                })}
              </>
            )}
          </>
        )}
      </div>

      {/* 8. Repeat vs New */}
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
            <div style={{ fontSize: 11, color: 'var(--color-text-3)', marginTop: 8, marginBottom: 14 }}>{guestTotal} total guests · active + checked out</div>

            {/* Comparison table */}
            {(repeatUsable.length > 0 || newUsable.length > 0) && (
              <>
                <p style={{ fontSize: 11, color: 'var(--color-text-3)', marginBottom: 8 }}>
                  Based on {usableGuests.length} of {guests.length} guests with usable dates
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 0, border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', overflow: 'hidden', fontSize: 12 }}>
                  {/* Header */}
                  <div style={{ padding: '7px 10px', background: 'var(--color-bg)', fontWeight: 600, color: 'var(--color-text-3)', borderBottom: '1px solid var(--color-border)' }}></div>
                  <div style={{ padding: '7px 10px', background: 'var(--color-bg)', fontWeight: 600, color: '#34d399', borderBottom: '1px solid var(--color-border)', borderLeft: '1px solid var(--color-border)', textAlign: 'center' }}>Repeat ({repeatUsable.length})</div>
                  <div style={{ padding: '7px 10px', background: 'var(--color-bg)', fontWeight: 600, color: '#93c5fd', borderBottom: '1px solid var(--color-border)', borderLeft: '1px solid var(--color-border)', textAlign: 'center' }}>First-time ({newUsable.length})</div>
                  {/* Rows */}
                  {[
                    { label: 'Avg nights',   r: repeatStats.avgNights, f: newStats.avgNights },
                    { label: 'Avg weight',   r: repeatStats.avgWeight, f: newStats.avgWeight },
                    { label: 'Avg age',      r: repeatStats.avgAge,    f: newStats.avgAge },
                    { label: 'Top level',    r: repeatStats.topLevel,  f: newStats.topLevel },
                    { label: '% incompatible', r: `${repeatStats.incompPct}%`, f: `${newStats.incompPct}%` },
                  ].map((row, i) => (
                    <>
                      <div key={`l${i}`} style={{ padding: '6px 10px', color: 'var(--color-text-2)', borderBottom: '1px solid var(--color-border)', background: i % 2 === 0 ? 'transparent' : 'var(--color-bg)' }}>{row.label}</div>
                      <div key={`r${i}`} style={{ padding: '6px 10px', textAlign: 'center', borderBottom: '1px solid var(--color-border)', borderLeft: '1px solid var(--color-border)', background: i % 2 === 0 ? 'transparent' : 'var(--color-bg)', fontWeight: 600 }}>{row.r}</div>
                      <div key={`f${i}`} style={{ padding: '6px 10px', textAlign: 'center', borderBottom: '1px solid var(--color-border)', borderLeft: '1px solid var(--color-border)', background: i % 2 === 0 ? 'transparent' : 'var(--color-bg)', fontWeight: 600 }}>{row.f}</div>
                    </>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* 9. Weather & calendar */}
      <div style={{ ...sec, marginBottom: 0 }}>
        <button
          onClick={() => setShowWeather(v => !v)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' as const }}
        >
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>Weather &amp; calendar</span>
          <span style={{ fontSize: 11, color: 'var(--color-text-3)', marginLeft: 'auto' }}>{showWeather ? '▾' : '▸'}</span>
        </button>

        {showWeather && (
          <>
            {weatherFailed && weatherReady ? (
              <p style={{ fontSize: 11, color: 'var(--color-text-3)', marginTop: 10 }}>Weather unavailable right now.</p>
            ) : (
            <>
            {/* This week tiles */}
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-2)', marginBottom: 8 }}>This week</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {thisWeekDays.map(dateStr => {
                  const d = new Date(dateStr + 'T12:00:00')
                  const dayAbbr = d.toLocaleDateString('en-US', { weekday: 'short' })
                  const w = weatherMap[dateStr]
                  const isRain = (w?.rainIn ?? 0) >= 0.05
                  const isToday = dateStr === today
                  return (
                    <div key={dateStr} style={{ background: 'var(--color-bg)', border: `1px solid ${isToday ? 'var(--color-accent)' : 'var(--color-border)'}`, borderRadius: 'var(--radius-md)', padding: '6px 8px', minWidth: 46, textAlign: 'center' as const }}>
                      <div style={{ fontSize: 10, color: isToday ? 'var(--color-accent)' : 'var(--color-text-3)', fontWeight: isToday ? 700 : 400, marginBottom: 2 }}>{dayAbbr}</div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>
                        {weatherReady ? (w?.highF != null ? `${Math.round(w.highF)}°` : '—') : '…'}
                      </div>
                      <div style={{ fontSize: 11, minHeight: 14 }}>{isRain ? '🌧' : ''}</div>
                    </div>
                  )
                })}
              </div>
              {upcomingEvents.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                  {upcomingEvents.map((ev, i) => (
                    <span key={i} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 999, background: 'var(--color-bg)', border: '1px solid var(--color-border)', color: 'var(--color-text-2)' }}>{ev}</span>
                  ))}
                </div>
              )}
            </div>

            {/* By week table */}
            {allWeekKeys.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-2)', marginBottom: 8 }}>By week</div>
                <div style={{ overflowX: 'auto' as const }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' as const, fontSize: 11 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                        <th style={{ textAlign: 'left' as const, padding: '4px 6px', color: 'var(--color-text-3)', fontWeight: 600 }}>Week</th>
                        <th style={{ textAlign: 'right' as const, padding: '4px 6px', color: 'var(--color-text-3)', fontWeight: 600 }}>Guests</th>
                        <th style={{ textAlign: 'right' as const, padding: '4px 6px', color: 'var(--color-text-3)', fontWeight: 600 }}>Avg daily high</th>
                        <th style={{ textAlign: 'right' as const, padding: '4px 6px', color: 'var(--color-text-3)', fontWeight: 600 }}>Rain days</th>
                        <th style={{ textAlign: 'left' as const, padding: '4px 6px', color: 'var(--color-text-3)', fontWeight: 600 }}>Holiday / school break</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(showAllWeatherWeeks ? allWeekKeys : allWeekKeys.slice(0, 12)).map(key => {
                        const wk = weekMap[key]
                        const guestCount = wk ? wk.wtSegs.reduce((a, b) => a + b, 0) : 0
                        const ww = weekWeather(key)
                        const calText = weekCalendarText(key)
                        return (
                          <tr key={key} style={{ borderBottom: '1px solid var(--color-border)' }}>
                            <td style={{ padding: '4px 6px', color: 'var(--color-text-2)' }}>{weekLabel(key)}</td>
                            <td style={{ padding: '4px 6px', textAlign: 'right' as const, color: 'var(--color-text-2)' }}>{guestCount}</td>
                            <td style={{ padding: '4px 6px', textAlign: 'right' as const, color: ww.avgHigh != null ? 'var(--color-text-2)' : 'var(--color-text-3)' }}>{weatherReady ? (ww.avgHigh != null ? `${ww.avgHigh}°` : 'N/A') : '…'}</td>
                            <td style={{ padding: '4px 6px', textAlign: 'right' as const, color: ww.rainDays != null && ww.rainDays > 0 ? 'var(--color-text-2)' : 'var(--color-text-3)' }}>{weatherReady ? (ww.rainDays != null ? ww.rainDays : 'N/A') : '…'}</td>
                            <td style={{ padding: '4px 6px', color: calText === '—' ? 'var(--color-text-3)' : 'var(--color-text-2)' }}>{calText}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                {allWeekKeys.length > 12 && (
                  <button
                    onClick={() => setShowAllWeatherWeeks(v => !v)}
                    style={{ marginTop: 8, fontSize: 12, color: 'var(--color-accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                  >
                    {showAllWeatherWeeks ? 'Show less' : `Show all ${allWeekKeys.length} weeks`}
                  </button>
                )}
              </div>
            )}

            <p style={{ fontSize: 10, color: 'var(--color-text-3)', marginTop: 12, paddingBottom: 2 }}>
              Avg daily high = average of that week&apos;s actual daily high temperatures (forecast for upcoming days), from Open-Meteo. School breaks are approximate typical dates.
            </p>
            </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
