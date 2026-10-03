'use client'
import { useState, useEffect, useMemo } from 'react'
import { categorizeWork, WORK_LABELS as WORK_CAT_LABELS, type WorkCategory } from '@/lib/shoeWork'

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
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.allSettled([
      fetch('/api/shoe-needs').then(r => r.json()),
      fetch('/api/farrier-visits').then(r => r.json()),
      fetch('/api/health').then(r => r.json()),
    ]).then(([n, v, h]) => {
      if (n.status === 'fulfilled') setNeeds(n.value.needs || [])
      if (v.status === 'fulfilled') setVisits(v.value.visits || [])
      if (h.status === 'fulfilled') setHealthIssues(h.value.issues || [])
      setLoading(false)
    })
  }, [])

  const [horseSort, setHorseSort] = useState<'name' | 'last_shod' | 'days_since' | 'overdue'>('overdue')
  const [horseAnalyticsPage, setHorseAnalyticsPage] = useState(1)
  const HORSE_ANALYTICS_PAGE_SIZE = 20
  const [timelineHorse, setTimelineHorse] = useState('')
  const [timelineFrom, setTimelineFrom] = useState('')
  const [timelineTo, setTimelineTo] = useState('')
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
