'use client'
import { useState, useEffect, useMemo } from 'react'
import { categorizeWork, isFullSet, WORK_LABELS as WORK_CAT_LABELS, type WorkCategory } from '@/lib/shoeWork'
import { getTucsonToday } from '@/lib/timezone'

type ShoeNeed = {
  id: string
  horse_name: string
  what_needed: string
  shoe_type: string
  is_drugger: boolean
  priority: boolean
  notes: string | null
  created_at: string
}

type FarrierVisitHorse = {
  id: string
  visit_id: string
  horse_name: string
  work_done: string
  shoe_type: string | null
  shoe_size: string | null
  placement: string | null
  notes: string | null
}

type FarrierVisit = {
  id: string
  visit_date: string
  farrier_name: string
  created_at: string
  farrier_visit_horses: FarrierVisitHorse[]
}

type HealthIssue = {
  id: string
  horse_name: string
  type: string
  status: string
  opened_at: string
}

type WorkloadHorse = {
  name: string
  is_active: boolean
  is_deceased: boolean
}

type WorkloadAssignment = {
  horse_name: string
  incompatible: boolean
  removed_at: string | null
}

type WorkloadGuest = {
  check_in_date: string | null
  check_out_date: string | null
  checked_out_at: string | null
  horse_assignments: WorkloadAssignment[] | null
}

const SHOE_TYPE_COLORS: Record<string, { bg: string; border: string; color: string; label: string }> = {
  regular:  { bg: '#f3f4f6', border: '#d1d5db', color: '#374151', label: 'Regular' },
  nb:       { bg: '#fef3c7', border: '#fcd34d', color: '#92400e', label: 'NB' },
  nb_pad:   { bg: '#fed7aa', border: '#fb923c', color: '#7c2d12', label: 'NB+Pad' },
  pad:      { bg: '#dcfce7', border: '#86efac', color: '#166534', label: 'Pad' },
  trim:     { bg: '#f0f9ff', border: '#7dd3fc', color: '#0369a1', label: 'Trim' },
  plastics: { bg: '#ede9fe', border: '#c4b5fd', color: '#7c3aed', label: 'Plastics' },
}

const DISPLAY_WORK_LABELS: Record<string, string> = {
  fronts: 'Fronts', rears: 'Rears', all_4s: 'All 4s', trim: 'Trim', reset: 'Reset', full_set: 'Full set',
}

function lastKnownShoeType(horseName: string, visits: FarrierVisit[]): string {
  for (const v of visits) {
    const h = v.farrier_visit_horses.find(fh => fh.horse_name === horseName && fh.shoe_type)
    if (h?.shoe_type) return h.shoe_type
  }
  return 'regular'
}

function horseLastVisitDate(horseName: string, visits: FarrierVisit[]): string | null {
  let latest: string | null = null
  visits.forEach(v => {
    if (v.farrier_visit_horses.some(h => h.horse_name === horseName)) {
      if (!latest || v.visit_date > latest) latest = v.visit_date
    }
  })
  return latest
}

function horseAvgIntervalDays(horseName: string, visits: FarrierVisit[]): number {
  const dates = visits
    .filter(v => v.farrier_visit_horses.some(h => h.horse_name === horseName))
    .map(v => v.visit_date)
    .sort()
  if (dates.length < 2) return 42
  let total = 0
  for (let i = 1; i < dates.length; i++) {
    const prev = new Date(dates[i - 1] + 'T12:00:00').getTime()
    const curr = new Date(dates[i] + 'T12:00:00').getTime()
    total += (curr - prev) / (24 * 60 * 60 * 1000)
  }
  return total / (dates.length - 1)
}

function formatMonth(ym: string): string {
  const d = new Date(ym + '-01T12:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
}

function median(arr: number[]): number | null {
  if (arr.length === 0) return null
  const sorted = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

function formatEstDate(daysLeft: number | null): string {
  if (daysLeft === null) return '—'
  if (daysLeft <= 0) return 'Due now (est.)'
  const today = getTucsonToday()
  const d = new Date(new Date(today + 'T12:00:00').getTime() + Math.round(daysLeft) * 24 * 60 * 60 * 1000)
  return `~${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} (est.)`
}

function MetricCard({ label, value, unit }: { label: string; value: string | number; unit?: string }) {
  return (
    <div style={{ padding: '12px 14px', background: 'var(--color-bg)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', textAlign: 'center' }}>
      <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--color-text)' }}>{value}</div>
      {unit && <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 1 }}>{unit}</div>}
      <div style={{ fontSize: 11, color: 'var(--color-text-3)', marginTop: 4 }}>{label}</div>
    </div>
  )
}

function HorseAnalyticsRow({ horse }: {
  horse: {
    name: string
    lastDate: string | null
    daysSinceLast: number | null
    avgDays: number
    shoeType: string
    isDrugger: boolean
    abscessCount: number
    isOverdue: boolean
    daysOverdue: number | null
    daysUntilDue: number | null
  }
}) {
  const isDueSoon = !horse.isOverdue && horse.daysUntilDue !== null && horse.daysUntilDue <= 14
  const typeColor = SHOE_TYPE_COLORS[horse.shoeType] || SHOE_TYPE_COLORS.regular
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 10px', background: 'var(--color-bg)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', marginBottom: 5, flexWrap: 'wrap' }}>
      <div style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: horse.isOverdue ? '#dc2626' : isDueSoon ? '#f59e0b' : '#22c55e' }} />
      <span style={{ fontWeight: 600, fontSize: 12, flex: 1, minWidth: 80 }}>🐴 {horse.name}</span>
      <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 999, fontWeight: 600, flexShrink: 0, background: typeColor.bg, color: typeColor.color, border: `1px solid ${typeColor.border}` }}>
        {typeColor.label}
      </span>
      {horse.isDrugger && (
        <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 999, background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5', fontWeight: 600, flexShrink: 0 }}>💊</span>
      )}
      {horse.abscessCount > 0 && (
        <span title={`${horse.abscessCount} abscess${horse.abscessCount !== 1 ? 'es' : ''} on record`} style={{ fontSize: 10, padding: '1px 5px', borderRadius: 999, background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d', fontWeight: 600, flexShrink: 0, cursor: 'help' }}>
          🦠 {horse.abscessCount}
        </span>
      )}
      <span style={{ fontSize: 11, color: 'var(--color-text-3)', flexShrink: 0 }}>
        {horse.lastDate ? `${horse.daysSinceLast}d ago` : 'no history'}
      </span>
      <span style={{ fontSize: 10, color: 'var(--color-text-muted)', flexShrink: 0 }}>~{horse.avgDays}d avg</span>
      {horse.isOverdue && (
        <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 999, background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5', fontWeight: 700, flexShrink: 0 }}>
          {horse.daysOverdue}d overdue
        </span>
      )}
      {isDueSoon && (
        <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 999, background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d', fontWeight: 700, flexShrink: 0 }}>
          due in {horse.daysUntilDue}d
        </span>
      )}
    </div>
  )
}

export function ShoeAnalyticsPanel() {
  const [needs, setNeeds] = useState<ShoeNeed[]>([])
  const [visits, setVisits] = useState<FarrierVisit[]>([])
  const [healthIssues, setHealthIssues] = useState<HealthIssue[]>([])
  const [wlHorses, setWlHorses] = useState<WorkloadHorse[]>([])
  const [wlGuests, setWlGuests] = useState<WorkloadGuest[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.allSettled([
      fetch('/api/shoe-needs').then(r => r.json()),
      fetch('/api/farrier-visits').then(r => r.json()),
      fetch('/api/health').then(r => r.json()),
      fetch('/api/horses').then(r => r.json()),
      fetch('/api/guests').then(r => r.json()),
    ]).then(([n, v, h, horses, guests]) => {
      if (n.status === 'fulfilled') setNeeds(n.value.needs || [])
      if (v.status === 'fulfilled') setVisits(v.value.visits || [])
      if (h.status === 'fulfilled') setHealthIssues(h.value.issues || [])
      if (horses.status === 'fulfilled') setWlHorses(horses.value.horses || [])
      if (guests.status === 'fulfilled') setWlGuests(guests.value.guests || [])
      setLoading(false)
    })
  }, [])

  const [horseSort, setHorseSort] = useState<'name' | 'last_shod' | 'days_since' | 'overdue'>('overdue')
  const [horseAnalyticsPage, setHorseAnalyticsPage] = useState(1)
  const HORSE_ANALYTICS_PAGE_SIZE = 20
  const WL_PAGE_SIZE = 20
  const [timelineHorse, setTimelineHorse] = useState('')
  const [timelineFrom, setTimelineFrom] = useState('')
  const [timelineTo, setTimelineTo] = useState('')
  const [wlSort, setWlSort] = useState<'est_next' | 'avg_gd' | 'avg_days' | 'current_gd'>('est_next')
  const [wlPage, setWlPage] = useState(1)
  const [otherAnimalsOpen, setOtherAnimalsOpen] = useState(false)
  const MS_PER_DAY = 24 * 60 * 60 * 1000

  const allHorseNames = useMemo(() =>
    Array.from(new Set(visits.flatMap(v => v.farrier_visit_horses.map(h => h.horse_name)))).sort()
  , [visits])

  const horsesThisMonth = useMemo(() => {
    const now = new Date()
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const set = new Set<string>()
    visits.forEach(v => { if (v.visit_date.startsWith(ym)) v.farrier_visit_horses.forEach(h => set.add(h.horse_name)) })
    return set.size
  }, [visits])

  const herdAvgDays = useMemo(() => {
    const withHistory = allHorseNames.filter(name =>
      visits.filter(v => v.farrier_visit_horses.some(h => h.horse_name === name)).length >= 2
    )
    if (withHistory.length === 0) return null
    return Math.round(withHistory.reduce((sum, name) => sum + horseAvgIntervalDays(name, visits), 0) / withHistory.length)
  }, [allHorseNames, visits])

  const mostCommonType = useMemo(() => {
    const counts: Record<string, number> = {}
    visits.forEach(v => v.farrier_visit_horses.forEach(h => {
      const t = h.shoe_type || 'regular'; counts[t] = (counts[t] || 0) + 1
    }))
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
  }, [visits])

  const abscessCounts = useMemo(() => {
    const c: Record<string, number> = {}
    healthIssues.forEach(i => { if (i.type === 'abscess') c[i.horse_name] = (c[i.horse_name] || 0) + 1 })
    return c
  }, [healthIssues])

  const activeDruggers = needs.filter(n => n.is_drugger).length
  const totalHerd = allHorseNames.length

  const horseData = useMemo(() => allHorseNames.map(name => {
    const lastDate = horseLastVisitDate(name, visits)
    const daysSinceLast = lastDate ? Math.floor((Date.now() - new Date(lastDate + 'T12:00:00').getTime()) / MS_PER_DAY) : null
    const avgDays = horseAvgIntervalDays(name, visits)
    const need = needs.find(n => n.horse_name === name)
    const shoeType = need?.shoe_type || lastKnownShoeType(name, visits)
    const isDrugger = need?.is_drugger ?? false
    const abscessCount = abscessCounts[name] || 0
    const nextExpectedMs = lastDate ? new Date(lastDate + 'T12:00:00').getTime() + avgDays * MS_PER_DAY : null
    const isOverdue = nextExpectedMs ? Date.now() > nextExpectedMs : false
    const daysOverdue = nextExpectedMs && isOverdue ? Math.floor((Date.now() - nextExpectedMs) / MS_PER_DAY) : null
    const daysUntilDue = nextExpectedMs && !isOverdue ? Math.floor((nextExpectedMs - Date.now()) / MS_PER_DAY) : null
    return { name, lastDate, daysSinceLast, avgDays, shoeType, isDrugger, abscessCount, isOverdue, daysOverdue, daysUntilDue }
  }), [allHorseNames, visits, needs, abscessCounts, MS_PER_DAY])

  const sortedHorses = useMemo(() => [...horseData].sort((a, b) => {
    if (horseSort === 'name') return a.name.localeCompare(b.name)
    if (horseSort === 'last_shod') {
      if (!a.lastDate && !b.lastDate) return 0
      if (!a.lastDate) return 1
      if (!b.lastDate) return -1
      return b.lastDate.localeCompare(a.lastDate)
    }
    if (horseSort === 'days_since') return (b.daysSinceLast ?? 9999) - (a.daysSinceLast ?? 9999)
    if (a.isOverdue && !b.isOverdue) return -1
    if (!a.isOverdue && b.isOverdue) return 1
    if (a.isOverdue && b.isOverdue) return (b.daysOverdue ?? 0) - (a.daysOverdue ?? 0)
    return (a.daysUntilDue ?? 9999) - (b.daysUntilDue ?? 9999)
  }), [horseData, horseSort])

  const horseTotalPages = Math.ceil(sortedHorses.length / HORSE_ANALYTICS_PAGE_SIZE)
  const pagedHorses = sortedHorses.slice((horseAnalyticsPage - 1) * HORSE_ANALYTICS_PAGE_SIZE, horseAnalyticsPage * HORSE_ANALYTICS_PAGE_SIZE)

  const shoeDistribution = useMemo(() => {
    const c: Record<string, number> = {}
    allHorseNames.forEach(name => {
      const need = needs.find(n => n.horse_name === name)
      const t = need?.shoe_type || lastKnownShoeType(name, visits)
      c[t] = (c[t] || 0) + 1
    })
    return c
  }, [allHorseNames, needs, visits])

  const visitsByMonth = useMemo(() => {
    const c: Record<string, number> = {}
    visits.forEach(v => { const m = v.visit_date.substring(0, 7); c[m] = (c[m] || 0) + 1 })
    return c
  }, [visits])
  const sortedMonths = Object.keys(visitsByMonth).sort()
  const maxVisits = sortedMonths.length > 0 ? Math.max(...sortedMonths.map(m => visitsByMonth[m])) : 1

  const druggerPct = needs.length > 0 ? Math.round((activeDruggers / needs.length) * 100) : 0

  const workBreakdown = useMemo(() => {
    const counts: Partial<Record<WorkCategory, number>> = {}
    visits.forEach(v => v.farrier_visit_horses.forEach(h => {
      const cat = categorizeWork(h.work_done)
      counts[cat] = (counts[cat] || 0) + 1
    }))
    return counts
  }, [visits])
  const totalWorkEntries = Object.values(workBreakdown).reduce((s, n) => s + (n ?? 0), 0)

  const timelineEntries = useMemo(() =>
    visits.flatMap(v => v.farrier_visit_horses.map(h => ({ ...h, visit_date: v.visit_date, farrier_name: v.farrier_name })))
      .sort((a, b) => b.visit_date.localeCompare(a.visit_date))
  , [visits])

  const filteredTimeline = useMemo(() => timelineEntries.filter(e => {
    if (timelineHorse && !e.horse_name.toLowerCase().includes(timelineHorse.toLowerCase())) return false
    if (timelineFrom && e.visit_date < timelineFrom) return false
    if (timelineTo && e.visit_date > timelineTo) return false
    return true
  }), [timelineEntries, timelineHorse, timelineFrom, timelineTo])

  const workloadData = useMemo(() => {
    const today = getTucsonToday()
    const MS = 24 * 60 * 60 * 1000

    // full-set dates per horse (ascending)
    const fullSetsByHorse: Record<string, string[]> = {}
    const sortedVisitsAsc = [...visits].sort((a, b) => a.visit_date.localeCompare(b.visit_date))
    sortedVisitsAsc.forEach(v => {
      v.farrier_visit_horses.forEach(h => {
        if (isFullSet(h.work_done)) {
          const key = h.horse_name.trim().toLowerCase()
          if (!fullSetsByHorse[key]) fullSetsByHorse[key] = []
          if (fullSetsByHorse[key][fullSetsByHorse[key].length - 1] !== v.visit_date) {
            fullSetsByHorse[key].push(v.visit_date)
          }
        }
      })
    })

    // compatible assignment windows per horse
    const assignsByHorse: Record<string, Array<{ s: string; e: string }>> = {}
    wlGuests.forEach(g => {
      if (!g.check_in_date) return
      let stayEnd = today
      if (g.check_out_date && g.check_out_date < stayEnd) stayEnd = g.check_out_date
      if (g.checked_out_at) {
        const d = g.checked_out_at.slice(0, 10)
        if (d < stayEnd) stayEnd = d
      }
      g.horse_assignments?.forEach(a => {
        if (a.incompatible) return
        let end = stayEnd
        if (a.removed_at) {
          const d = a.removed_at.slice(0, 10)
          if (d < end) end = d
        }
        const key = a.horse_name.trim().toLowerCase()
        if (!assignsByHorse[key]) assignsByHorse[key] = []
        assignsByHorse[key].push({ s: g.check_in_date!, e: end })
      })
    })

    function countGD(horseName: string, cycleStart: string, cycleEnd: string): number {
      const key = horseName.trim().toLowerCase()
      let total = 0
      for (const a of assignsByHorse[key] || []) {
        const start = a.s > cycleStart ? a.s : cycleStart
        const end = a.e < cycleEnd ? a.e : cycleEnd
        if (end >= start) {
          total += Math.round((new Date(end + 'T12:00:00').getTime() - new Date(start + 'T12:00:00').getTime()) / MS) + 1
        }
      }
      return total
    }

    const activeHorseKeys = new Set(
      wlHorses.filter(h => h.is_active && !h.is_deceased).map(h => h.name.trim().toLowerCase())
    )

    const horseWorkload = wlHorses
      .filter(h => h.is_active && !h.is_deceased)
      .map(horse => {
        const key = horse.name.trim().toLowerCase()
        const dates = fullSetsByHorse[key] || []

        const cycles: Array<{ gd: number; days: number; touchUps: number }> = []
        for (let i = 0; i < dates.length - 1; i++) {
          const cs = dates[i], ce = dates[i + 1]
          let touchUps = 0
          sortedVisitsAsc.forEach(v => {
            if (v.visit_date > cs && v.visit_date < ce) {
              v.farrier_visit_horses.forEach(h => {
                if (h.horse_name.trim().toLowerCase() === key && !isFullSet(h.work_done)) touchUps++
              })
            }
          })
          cycles.push({
            gd: countGD(horse.name, cs, ce),
            days: Math.round((new Date(ce + 'T12:00:00').getTime() - new Date(cs + 'T12:00:00').getTime()) / MS),
            touchUps,
          })
        }

        const n = cycles.length
        const avgDays = n > 0 ? cycles.reduce((s, c) => s + c.days, 0) / n : null
        const avgGD = n > 0 ? cycles.reduce((s, c) => s + c.gd, 0) / n : null
        const avgTU = n > 0 ? cycles.reduce((s, c) => s + c.touchUps, 0) / n : null

        const lastFS = dates.length > 0 ? dates[dates.length - 1] : null
        const curDays = lastFS ? Math.round((new Date(today + 'T12:00:00').getTime() - new Date(lastFS + 'T12:00:00').getTime()) / MS) : null
        const curGD = lastFS ? countGD(horse.name, lastFS, today) : null

        let pace: number | null = null
        if (lastFS && curDays !== null) {
          const todayMs = new Date(today + 'T12:00:00').getTime()
          const raw14 = new Date(todayMs - 13 * MS).toISOString().slice(0, 10)
          const winStart = raw14 > lastFS ? raw14 : lastFS
          const winDays = Math.round((todayMs - new Date(winStart + 'T12:00:00').getTime()) / MS) + 1
          if (winDays > 0) pace = countGD(horse.name, winStart, today) / winDays
        }

        return { name: horse.name, completedCycles: n, avgDays, avgGD, avgTU, lastFS, curDays, curGD, pace }
      })

    const qualified = horseWorkload.filter(h => h.completedCycles >= 2)
    const herdMedDays = median(qualified.map(h => h.avgDays).filter((d): d is number => d !== null))
    const herdMedGD = median(qualified.map(h => h.avgGD).filter((d): d is number => d !== null))

    const withEst = horseWorkload.map(h => {
      const targetGD = h.completedCycles >= 2 ? h.avgGD : herdMedGD
      const fallDays = h.completedCycles >= 2 ? h.avgDays : herdMedDays
      let estDaysLeft: number | null = null
      let estBasis: 'own' | 'herd' | null = null

      if (targetGD !== null && h.curGD !== null && h.pace !== null && h.pace > 0) {
        estDaysLeft = (targetGD - h.curGD) / h.pace
        estBasis = h.completedCycles >= 2 ? 'own' : 'herd'
      } else if (fallDays !== null && h.curDays !== null) {
        estDaysLeft = fallDays - h.curDays
        estBasis = h.completedCycles >= 2 ? 'own' : 'herd'
      }

      const wearsFaster = h.completedCycles >= 2 && herdMedGD !== null && h.avgGD !== null && h.avgGD < 0.7 * herdMedGD
      return { ...h, estDaysLeft, estBasis, wearsFaster }
    })

    // Other animals: appear in visits but not in horses table
    const allVisitNames = Array.from(new Set(visits.flatMap(v => v.farrier_visit_horses.map(h => h.horse_name))))
    const otherAnimals = allVisitNames
      .filter(name => !activeHorseKeys.has(name.trim().toLowerCase()))
      .sort()
      .map(name => {
        const key = name.trim().toLowerCase()
        const dates = fullSetsByHorse[key] || []
        const lastFS = dates.length > 0 ? dates[dates.length - 1] : null
        const daysSince = lastFS ? Math.round((new Date(today + 'T12:00:00').getTime() - new Date(lastFS + 'T12:00:00').getTime()) / MS) : null
        let avgDays: number | null = null
        if (dates.length >= 2) {
          let tot = 0
          for (let i = 1; i < dates.length; i++) {
            tot += Math.round((new Date(dates[i] + 'T12:00:00').getTime() - new Date(dates[i - 1] + 'T12:00:00').getTime()) / MS)
          }
          avgDays = tot / (dates.length - 1)
        }
        return { name, lastFS, daysSince, avgDays }
      })

    return { horseWorkload: withEst, herdMedDays, herdMedGD, qualifiedCount: qualified.length, otherAnimals }
  }, [visits, wlHorses, wlGuests])

  const sortedWorkload = useMemo(() => [...workloadData.horseWorkload].sort((a, b) => {
    if (wlSort === 'est_next') return (a.estDaysLeft ?? Infinity) - (b.estDaysLeft ?? Infinity)
    if (wlSort === 'avg_gd') return (b.avgGD ?? -1) - (a.avgGD ?? -1)
    if (wlSort === 'avg_days') return (a.avgDays ?? Infinity) - (b.avgDays ?? Infinity)
    return (b.curGD ?? -1) - (a.curGD ?? -1)
  }), [workloadData.horseWorkload, wlSort])

  const wlTotalPages = Math.max(1, Math.ceil(sortedWorkload.length / WL_PAGE_SIZE))
  const pagedWorkload = sortedWorkload.slice((wlPage - 1) * WL_PAGE_SIZE, wlPage * WL_PAGE_SIZE)

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'var(--color-text-3)', fontSize: 13 }}>Loading shoe stats…</p>
      </div>
    )
  }

  if (visits.length === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'var(--color-text-3)', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>Analytics will appear as visit history builds up.</p>
      </div>
    )
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 48px' }}>
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Shoe Stats</h2>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 22 }} className="analytics-summary-grid">
        <MetricCard label="Shod this month" value={horsesThisMonth} unit={horsesThisMonth === 1 ? 'horse' : 'horses'} />
        <MetricCard label="Avg interval" value={herdAvgDays !== null ? herdAvgDays : '—'} unit={herdAvgDays !== null ? 'days' : ''} />
        <MetricCard label="Most common type" value={mostCommonType ? (SHOE_TYPE_COLORS[mostCommonType]?.label ?? mostCommonType) : '—'} />
        <MetricCard label="Active druggers" value={activeDruggers} unit={activeDruggers === 1 ? 'horse' : 'horses'} />
      </div>

      {/* Per-horse breakdown */}
      <section id="shoe-panel-horse-top" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 6 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-2)' }}>Per Horse ({totalHerd})</div>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {(['overdue', 'name', 'last_shod', 'days_since'] as const).map(s => (
              <button key={s} onClick={() => { setHorseSort(s); setHorseAnalyticsPage(1) }} style={{
                padding: '2px 8px', borderRadius: 999, fontSize: 11, cursor: 'pointer',
                border: horseSort === s ? '1px solid var(--color-accent)' : '1px solid var(--color-border)',
                background: horseSort === s ? 'var(--color-accent-bg)' : 'transparent',
                color: horseSort === s ? 'var(--color-accent)' : 'var(--color-text-3)',
                fontWeight: horseSort === s ? 600 : 400,
              }}>
                {s === 'overdue' ? 'Overdue first' : s === 'name' ? 'Name' : s === 'last_shod' ? 'Last shod' : 'Days since'}
              </button>
            ))}
          </div>
        </div>
        {pagedHorses.map(h => <HorseAnalyticsRow key={h.name} horse={h} />)}
        {sortedHorses.length > HORSE_ANALYTICS_PAGE_SIZE && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--color-border)' }}>
            <button type="button" onClick={() => { setHorseAnalyticsPage(p => Math.max(1, p - 1)); document.getElementById('shoe-panel-horse-top')?.scrollIntoView({ behavior: 'smooth' }) }} disabled={horseAnalyticsPage === 1} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: horseAnalyticsPage === 1 ? 'var(--color-text-muted)' : 'var(--color-text-2)', cursor: horseAnalyticsPage === 1 ? 'default' : 'pointer' }}>← Previous</button>
            <span style={{ fontSize: 12, color: 'var(--color-text-3)' }}>Page {horseAnalyticsPage} of {horseTotalPages}</span>
            <button type="button" onClick={() => { setHorseAnalyticsPage(p => Math.min(horseTotalPages, p + 1)); document.getElementById('shoe-panel-horse-top')?.scrollIntoView({ behavior: 'smooth' }) }} disabled={horseAnalyticsPage === horseTotalPages} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: horseAnalyticsPage === horseTotalPages ? 'var(--color-text-muted)' : 'var(--color-text-2)', cursor: horseAnalyticsPage === horseTotalPages ? 'default' : 'pointer' }}>Next →</button>
          </div>
        )}
      </section>

      {/* Herd trends */}
      <section style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-2)', marginBottom: 12 }}>Herd Trends</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }} className="analytics-trends-grid">

          {/* Shoe type distribution */}
          <div style={{ padding: 14, background: 'var(--color-bg)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-3)', marginBottom: 10 }}>Shoe type distribution</div>
            <div style={{ display: 'flex', borderRadius: 4, overflow: 'hidden', height: 16, marginBottom: 10 }}>
              {Object.entries(shoeDistribution).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
                <div key={type} style={{ width: `${(count / totalHerd) * 100}%`, background: SHOE_TYPE_COLORS[type]?.bg || '#f3f4f6', borderRight: '1px solid rgba(0,0,0,0.06)' }} />
              ))}
            </div>
            {Object.entries(shoeDistribution).sort((a, b) => b[1] - a[1]).map(([type, count]) => {
              const tc = SHOE_TYPE_COLORS[type] || SHOE_TYPE_COLORS.regular
              return (
                <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                  <div style={{ width: 9, height: 9, borderRadius: 2, flexShrink: 0, background: tc.bg, border: `1px solid ${tc.border}` }} />
                  <span style={{ fontSize: 11, color: 'var(--color-text-2)', flex: 1 }}>{tc.label}</span>
                  <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{count} · {Math.round((count / totalHerd) * 100)}%</span>
                </div>
              )
            })}
          </div>

          {/* Drugger share + Visits per month */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ padding: 14, background: 'var(--color-bg)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-3)', marginBottom: 8 }}>Drugger share</div>
              <div style={{ height: 8, borderRadius: 999, background: 'var(--color-border)', overflow: 'hidden', marginBottom: 6 }}>
                <div style={{ height: '100%', width: `${druggerPct}%`, background: '#fca5a5', borderRadius: 999 }} />
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-text-2)' }}>
                {activeDruggers} of {needs.length} on needs list · {druggerPct}%
              </div>
            </div>

            <div style={{ padding: 14, background: 'var(--color-bg)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-3)', marginBottom: 10 }}>Visits per month</div>
              {sortedMonths.map(m => (
                <div key={m} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                  <div style={{ width: 46, fontSize: 10, color: 'var(--color-text-muted)', textAlign: 'right', flexShrink: 0 }}>{formatMonth(m)}</div>
                  <div style={{ flex: 1, height: 14, background: 'var(--color-border)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${(visitsByMonth[m] / maxVisits) * 100}%`, height: '100%', background: 'var(--color-accent)', borderRadius: 3, minWidth: 3 }} />
                  </div>
                  <div style={{ width: 16, fontSize: 10, color: 'var(--color-text-muted)', textAlign: 'right', flexShrink: 0 }}>{visitsByMonth[m]}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Work done breakdown */}
      {totalWorkEntries > 0 && (
        <section style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-2)', marginBottom: 12 }}>Work Done</div>
          <div style={{ padding: 14, background: 'var(--color-bg)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
            {(Object.keys(WORK_CAT_LABELS) as WorkCategory[]).map(cat => {
              const count = workBreakdown[cat] || 0
              if (count === 0) return null
              const pct = Math.round((count / totalWorkEntries) * 100)
              return (
                <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
                  <div style={{ width: 52, fontSize: 11, color: 'var(--color-text-2)', textAlign: 'right', flexShrink: 0 }}>{WORK_CAT_LABELS[cat]}</div>
                  <div style={{ flex: 1, height: 12, background: 'var(--color-border)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: 'var(--color-accent)', borderRadius: 3, minWidth: 2 }} />
                  </div>
                  <div style={{ width: 28, fontSize: 10, color: 'var(--color-text-muted)', textAlign: 'right', flexShrink: 0 }}>{count}</div>
                  <div style={{ width: 28, fontSize: 10, color: 'var(--color-text-muted)', textAlign: 'right', flexShrink: 0 }}>{pct}%</div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Shoes vs. workload */}
      <section id="shoe-panel-workload-top" style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-2)', marginBottom: 12 }}>Shoes vs. Workload</div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 14 }} className="analytics-summary-grid">
          <MetricCard label="Median days / cycle" value={workloadData.herdMedDays !== null ? Math.round(workloadData.herdMedDays) : '—'} />
          <MetricCard label="Median guest-days / cycle" value={workloadData.herdMedGD !== null ? Math.round(workloadData.herdMedGD) : '—'} />
          <MetricCard label="Horses with 2+ cycles" value={workloadData.qualifiedCount} />
        </div>

        <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 12, fontStyle: 'italic' }}>
          Guest-days = days a guest was assigned to the horse. Estimates use the horse's own history when it has 2+ full cycles, otherwise herd typical.
        </p>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 6 }}>
          <div style={{ fontSize: 12, color: 'var(--color-text-3)' }}>{workloadData.horseWorkload.length} horses</div>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {(['est_next', 'avg_gd', 'avg_days', 'current_gd'] as const).map(s => (
              <button key={s} onClick={() => { setWlSort(s); setWlPage(1) }} style={{
                padding: '2px 8px', borderRadius: 999, fontSize: 11, cursor: 'pointer',
                border: wlSort === s ? '1px solid var(--color-accent)' : '1px solid var(--color-border)',
                background: wlSort === s ? 'var(--color-accent-bg)' : 'transparent',
                color: wlSort === s ? 'var(--color-accent)' : 'var(--color-text-3)',
                fontWeight: wlSort === s ? 600 : 400,
              }}>
                {s === 'est_next' ? 'Est. next' : s === 'avg_gd' ? 'Avg guest-days' : s === 'avg_days' ? 'Avg days' : 'Current GD'}
              </button>
            ))}
          </div>
        </div>

        {pagedWorkload.map(h => {
          const estStr = formatEstDate(h.estDaysLeft)
          const isDueNow = h.estDaysLeft !== null && h.estDaysLeft <= 0
          const isDueSoon = !isDueNow && h.estDaysLeft !== null && h.estDaysLeft <= 14
          return (
            <div key={h.name} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 10px', background: 'var(--color-bg)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', marginBottom: 5 }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, marginTop: 5, background: isDueNow ? '#dc2626' : isDueSoon ? '#f59e0b' : '#22c55e' }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', marginBottom: 2 }}>
                  <span style={{ fontWeight: 600, fontSize: 12 }}>🐴 {h.name}</span>
                  {h.wearsFaster && (
                    <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 999, background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5', fontWeight: 600 }}>⚡ Wears faster</span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: 'var(--color-text-3)', display: 'flex', flexWrap: 'wrap', gap: '0 10px' }}>
                  <span>{h.completedCycles} cycle{h.completedCycles !== 1 ? 's' : ''}</span>
                  {h.avgDays !== null && <span>~{Math.round(h.avgDays)}d avg</span>}
                  {h.avgGD !== null && <span>~{Math.round(h.avgGD)} GD avg</span>}
                  {h.avgTU !== null && h.avgTU >= 0.1 && <span>~{Math.round(h.avgTU * 10) / 10} touch-up{h.avgTU >= 1.95 ? 's' : ''}/cycle</span>}
                </div>
                <div style={{ fontSize: 11, color: 'var(--color-text-muted)', display: 'flex', flexWrap: 'wrap', gap: '0 10px', marginTop: 1 }}>
                  {h.curDays !== null && <span>Now: {h.curDays}d in</span>}
                  {h.curGD !== null && <span>{h.curGD} GD</span>}
                  {h.pace !== null && h.pace > 0 && <span>pace {h.pace.toFixed(2)} GD/d</span>}
                </div>
              </div>
              <div style={{ flexShrink: 0, textAlign: 'right' }}>
                <span style={{
                  display: 'inline-block', fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 999,
                  background: isDueNow ? '#fee2e2' : isDueSoon ? '#fef3c7' : 'var(--color-surface)',
                  color: isDueNow ? '#dc2626' : isDueSoon ? '#92400e' : 'var(--color-text-3)',
                  border: isDueNow ? '1px solid #fca5a5' : isDueSoon ? '1px solid #fcd34d' : '1px solid var(--color-border)',
                }}>
                  {estStr}
                </span>
                {h.estBasis && (
                  <div style={{ fontSize: 10, color: 'var(--color-text-muted)', marginTop: 2, fontStyle: 'italic' }}>
                    {h.estBasis === 'own' ? 'own history' : 'herd avg'}
                  </div>
                )}
              </div>
            </div>
          )
        })}

        {sortedWorkload.length > WL_PAGE_SIZE && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--color-border)' }}>
            <button type="button" onClick={() => { setWlPage(p => Math.max(1, p - 1)); document.getElementById('shoe-panel-workload-top')?.scrollIntoView({ behavior: 'smooth' }) }} disabled={wlPage === 1} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: wlPage === 1 ? 'var(--color-text-muted)' : 'var(--color-text-2)', cursor: wlPage === 1 ? 'default' : 'pointer' }}>← Previous</button>
            <span style={{ fontSize: 12, color: 'var(--color-text-3)' }}>Page {wlPage} of {wlTotalPages}</span>
            <button type="button" onClick={() => { setWlPage(p => Math.min(wlTotalPages, p + 1)); document.getElementById('shoe-panel-workload-top')?.scrollIntoView({ behavior: 'smooth' }) }} disabled={wlPage === wlTotalPages} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: wlPage === wlTotalPages ? 'var(--color-text-muted)' : 'var(--color-text-2)', cursor: wlPage === wlTotalPages ? 'default' : 'pointer' }}>Next →</button>
          </div>
        )}

        {workloadData.otherAnimals.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <button
              type="button"
              onClick={() => setOtherAnimalsOpen(o => !o)}
              style={{ fontSize: 12, color: 'var(--color-text-3)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 4 }}
            >
              <span style={{ fontSize: 11 }}>{otherAnimalsOpen ? '▼' : '▶'}</span>
              Other animals ({workloadData.otherAnimals.length}) — intervals only
            </button>
            {otherAnimalsOpen && (
              <div style={{ marginTop: 8 }}>
                {workloadData.otherAnimals.map(a => (
                  <div key={a.name} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'var(--color-bg)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', marginBottom: 4, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600, fontSize: 12, flex: 1, minWidth: 80 }}>🐴 {a.name}</span>
                    <span style={{ fontSize: 11, color: 'var(--color-text-muted)', fontStyle: 'italic', flexShrink: 0 }}>No guest workload</span>
                    {a.avgDays !== null && <span style={{ fontSize: 11, color: 'var(--color-text-3)', flexShrink: 0 }}>~{Math.round(a.avgDays)}d avg</span>}
                    {a.daysSince !== null && <span style={{ fontSize: 11, color: 'var(--color-text-3)', flexShrink: 0 }}>{a.daysSince}d since last set</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Farrier visit timeline */}
      <section>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-2)', marginBottom: 10 }}>Visit Timeline</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          <input
            placeholder="Filter by horse..."
            value={timelineHorse}
            onChange={e => setTimelineHorse(e.target.value)}
            style={{ fontSize: 12, flex: 1, minWidth: 140 }}
          />
          <input type="date" value={timelineFrom} onChange={e => setTimelineFrom(e.target.value)} style={{ fontSize: 12 }} />
          <input type="date" value={timelineTo} onChange={e => setTimelineTo(e.target.value)} style={{ fontSize: 12 }} />
          {(timelineHorse || timelineFrom || timelineTo) && (
            <button onClick={() => { setTimelineHorse(''); setTimelineFrom(''); setTimelineTo('') }}
              style={{ fontSize: 12, padding: '4px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-bg)', cursor: 'pointer', color: 'var(--color-text-3)' }}>
              Clear
            </button>
          )}
        </div>
        <div style={{ maxHeight: 360, overflowY: 'auto', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
          {filteredTimeline.length === 0 ? (
            <p style={{ textAlign: 'center', padding: '20px 0', fontSize: 13, color: 'var(--color-text-3)' }}>No entries match</p>
          ) : filteredTimeline.map((e, i) => {
            const tc = e.shoe_type && e.shoe_type !== 'regular' ? SHOE_TYPE_COLORS[e.shoe_type] : null
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 12px', borderBottom: i < filteredTimeline.length - 1 ? '1px solid var(--color-border)' : 'none', flexWrap: 'wrap', background: i % 2 === 0 ? 'var(--color-bg)' : 'var(--color-surface)' }}>
                <span style={{ fontSize: 11, color: 'var(--color-text-muted)', flexShrink: 0, minWidth: 68 }}>
                  {new Date(e.visit_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}
                </span>
                <span style={{ fontSize: 13, flexShrink: 0 }}>🐴</span>
                <span style={{ fontWeight: 600, fontSize: 12, flex: 1, minWidth: 80 }}>{e.horse_name}</span>
                <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 999, background: 'var(--color-warning-bg)', color: 'var(--color-warning)', fontWeight: 600, border: '1px solid var(--color-warning-border)', flexShrink: 0 }}>
                  {DISPLAY_WORK_LABELS[e.work_done] || e.work_done}
                </span>
                {tc && (
                  <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 999, fontWeight: 600, flexShrink: 0, background: tc.bg, color: tc.color, border: `1px solid ${tc.border}` }}>
                    {tc.label}
                  </span>
                )}
                {e.shoe_size && <span style={{ fontSize: 11, color: 'var(--color-text-3)', flexShrink: 0 }}>sz {e.shoe_size}</span>}
                {e.placement && <span style={{ fontSize: 11, color: 'var(--color-text-3)', flexShrink: 0 }}>{e.placement}</span>}
                {e.notes && <span style={{ fontSize: 11, color: 'var(--color-text-3)', fontStyle: 'italic', flex: 1 }}>{e.notes}</span>}
                <span style={{ fontSize: 10, color: 'var(--color-text-muted)', flexShrink: 0 }}>{e.farrier_name}</span>
              </div>
            )
          })}
        </div>
        {filteredTimeline.length > 0 && (
          <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 6, textAlign: 'right' }}>
            {filteredTimeline.length} entr{filteredTimeline.length === 1 ? 'y' : 'ies'}
          </div>
        )}
      </section>
    </div>
  )
}
