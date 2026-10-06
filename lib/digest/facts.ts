import { LEVEL_LABELS } from '@/lib/horses'
import { fetchWeather } from '@/lib/weather'
import { holidaysInRange, schoolBreakFor } from '@/lib/calendar'
import { runAllDetectors } from '@/lib/patterns/index'
import { isFullSet } from '@/lib/shoeWork'
import type { PatternGuest, PatternFlag, PatternHorse, PatternVisit } from '@/lib/patterns/types'

const MS = 86400000

function addDays(date: string, n: number): string {
  const d = new Date(date + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function daysBetween(a: string, b: string): number {
  return Math.round(
    (new Date(b + 'T12:00:00Z').getTime() - new Date(a + 'T12:00:00Z').getTime()) / MS
  )
}

export async function buildWeekFacts(supabase: any, weekStart: string): Promise<any> {
  const weekEnd    = addDays(weekStart, 6)
  const priorStart = addDays(weekStart, -7)
  const priorEnd   = addDays(weekStart, -1)
  const nextStart  = addDays(weekStart,  7)
  const nextEnd    = addDays(weekStart, 13)

  const [
    { data: guestsRaw },
    { data: horsesRaw },
    { data: flagsRaw },
    { data: visitsRaw },
    { data: hFlagsRaw },
  ] = await Promise.all([
    supabase.from('guests').select(
      'id, name, check_in_date, check_out_date, checked_out_at, age, weight, gender, riding_level, horse_assignments(horse_name, incompatible, removed_at, swap_category, swap_reason, reason)'
    ).limit(10000),
    supabase.from('horses').select('name, level, weight, is_active, is_draft, farrier').limit(500),
    supabase.from('horse_status_flags')
      .select('horse_name, flag_type, status, flagged_at, day_off_date, notes')
      .order('flagged_at', { ascending: false }),
    supabase.from('farrier_visits')
      .select('visit_date, farrier_name, farrier_visit_horses(horse_name, work_done)')
      .order('visit_date', { ascending: false })
      .limit(2000),
    supabase.from('horse_status_flags')
      .select('horse_name, flag_type, status, day_off_date, flagged_at')
      .eq('status', 'active'),
  ])

  const guests  = (guestsRaw  || []) as any[]
  const allHorses = (horsesRaw  || []) as any[]
  const flags   = (flagsRaw   || []) as any[]
  const visits  = (visitsRaw  || []) as any[]
  const activeHorses = allHorses.filter((h: any) => h.is_active)

  // ── Helpers ────────────────────────────────────────────────────────────────

  function guestsInRange(start: string, end: string) {
    return guests.filter(g => g.check_in_date <= end && g.check_out_date >= start)
  }

  function guestStats(gList: any[], rangeStart: string, rangeEnd: string) {
    const levelMix: Record<string, number> = {}
    for (const g of gList) {
      const lbl = LEVEL_LABELS[g.riding_level] || g.riding_level || 'unknown'
      levelMix[lbl] = (levelMix[lbl] || 0) + 1
    }
    return {
      on_property: gList.length,
      arrivals:    gList.filter(g => g.check_in_date >= rangeStart && g.check_in_date <= rangeEnd).length,
      checkouts:   gList.filter(g => g.check_out_date >= rangeStart && g.check_out_date <= rangeEnd).length,
      kids_under_13:    gList.filter(g => g.age    != null && g.age    < 13).length,
      riders_200_plus:  gList.filter(g => g.weight != null && g.weight >= 200).length,
      level_mix:   levelMix,
    }
  }

  function horseGuestDays(gList: any[], rangeStart: string, rangeEnd: string) {
    const dayMap: Record<string, number> = {}
    for (const g of gList) {
      const gS = g.check_in_date  > rangeStart ? g.check_in_date  : rangeStart
      const gE = g.check_out_date < rangeEnd   ? g.check_out_date : rangeEnd
      const overlap = Math.max(1, daysBetween(gS, gE) + 1)
      const seen = new Set<string>()
      for (const a of g.horse_assignments || []) {
        if (a.incompatible || a.removed_at) continue
        if (!seen.has(a.horse_name)) {
          seen.add(a.horse_name)
          dayMap[a.horse_name] = (dayMap[a.horse_name] || 0) + overlap
        }
      }
    }
    return Object.entries(dayMap)
      .sort(([, a], [, b]) => (b as number) - (a as number))
      .slice(0, 5)
      .map(([name, guest_days]) => ({ name, guest_days: guest_days as number }))
  }

  // ── Guest stats ────────────────────────────────────────────────────────────

  const curGuests  = guestsInRange(weekStart, weekEnd)
  const prevGuests = guestsInRange(priorStart, priorEnd)
  const curStats   = guestStats(curGuests,  weekStart, weekEnd)
  const prevStats  = guestStats(prevGuests, priorStart, priorEnd)

  // ── Horse activity ─────────────────────────────────────────────────────────

  const busiestCur  = horseGuestDays(curGuests,  weekStart, weekEnd)
  const busiestPrev = horseGuestDays(prevGuests, priorStart, priorEnd)

  const lastAssigned: Record<string, string> = {}
  for (const g of guests) {
    for (const a of g.horse_assignments || []) {
      if (!lastAssigned[a.horse_name] || g.check_in_date > lastAssigned[a.horse_name]) {
        lastAssigned[a.horse_name] = g.check_in_date
      }
    }
  }

  const blockedHorses = new Set<string>()
  for (const f of hFlagsRaw || []) {
    if (f.status === 'active' && f.flag_type !== 'day_off') blockedHorses.add(f.horse_name)
  }

  const idleHorses = activeHorses
    .filter((h: any) => !h.is_draft && !blockedHorses.has(h.name))
    .map((h: any) => {
      const last = lastAssigned[h.name] || null
      return { name: h.name, last_assigned: last, days_idle: last ? daysBetween(last, weekEnd) : 999 }
    })
    .filter((h: any) => h.days_idle >= 14)
    .sort((a: any, b: any) => b.days_idle - a.days_idle)

  // ── Swaps ──────────────────────────────────────────────────────────────────

  const curSwaps: any[] = []
  for (const g of curGuests) {
    for (const a of g.horse_assignments || []) {
      if (!a.incompatible) continue
      curSwaps.push({
        guest: g.name,
        horse: a.horse_name,
        category: a.swap_category || 'uncategorized',
        reason: a.swap_reason || null,
      })
    }
  }

  const prevSwapCount = prevGuests.reduce(
    (n: number, g: any) => n + (g.horse_assignments || []).filter((a: any) => a.incompatible).length, 0
  )

  const swapByCat: Record<string, { count: number; examples: string[] }> = {}
  for (const s of curSwaps) {
    if (!swapByCat[s.category]) swapByCat[s.category] = { count: 0, examples: [] }
    swapByCat[s.category].count++
    if (swapByCat[s.category].examples.length < 3) {
      const ex = `${s.guest} off ${s.horse}${s.reason ? ': ' + s.reason : ''}`
      swapByCat[s.category].examples.push(ex)
    }
  }

  // ── Health flags ───────────────────────────────────────────────────────────

  const openedFlags = flags.filter((f: any) =>
    f.flagged_at >= weekStart + 'T00:00:00' && f.flagged_at <= weekEnd + 'T23:59:59'
  )
  const openedFlagsPrevCount = flags.filter((f: any) =>
    f.flagged_at >= priorStart + 'T00:00:00' && f.flagged_at <= priorEnd + 'T23:59:59'
  ).length

  const activeHealthFlags = (hFlagsRaw || [])
    .filter((f: any) => f.status === 'active' && f.flag_type !== 'day_off')
    .map((f: any) => ({ horse: f.horse_name, type: f.flag_type, since: f.flagged_at?.slice(0, 10) }))

  // ── Farrier ────────────────────────────────────────────────────────────────

  const weekVisits = visits.filter((v: any) => v.visit_date >= weekStart && v.visit_date <= weekEnd)
  const prevVisitCount = visits.filter((v: any) => v.visit_date >= priorStart && v.visit_date <= priorEnd).length

  // Overdue horses: last full set + avg gap + 14 day buffer
  const horseShoeHistory: Record<string, string[]> = {}
  for (const v of visits) {
    for (const h of v.farrier_visit_horses || []) {
      if (!isFullSet(h.work_done)) continue
      if (!horseShoeHistory[h.horse_name]) horseShoeHistory[h.horse_name] = []
      horseShoeHistory[h.horse_name].push(v.visit_date)
    }
  }

  function computeOverdue(endDate: string) {
    const result: any[] = []
    for (const h of activeHorses) {
      const dates = (horseShoeHistory[h.name] || []).filter((d: string) => d <= endDate).sort()
      if (dates.length === 0) continue
      const lastFS = dates[dates.length - 1]
      const daysSince = daysBetween(lastFS, endDate)
      if (dates.length < 2) continue
      let total = 0
      for (let i = 1; i < dates.length; i++) total += daysBetween(dates[i - 1], dates[i])
      const avgGap = Math.round(total / (dates.length - 1))
      if (avgGap > 0 && daysSince > avgGap + 14) {
        result.push({ name: h.name, last_full_set: lastFS, days_since: daysSince, usual_gap: avgGap, days_overdue: daysSince - avgGap })
      }
    }
    return result
  }

  const overdueHorses = computeOverdue(weekEnd)
  const overdueHorsesPrevCount = computeOverdue(priorEnd).length

  // ── Pattern findings ───────────────────────────────────────────────────────

  const hFlagsByHorse: Record<string, PatternHorse['flags']> = {}
  ;(hFlagsRaw || []).forEach((f: any) => {
    if (!hFlagsByHorse[f.horse_name]) hFlagsByHorse[f.horse_name] = []
    hFlagsByHorse[f.horse_name].push({
      flag_type: f.flag_type, status: f.status,
      day_off_date: f.day_off_date ?? null, flagged_at: f.flagged_at,
    })
  })

  const patternHorses: PatternHorse[] = allHorses.map((h: any) => ({
    name: h.name, level: h.level, weight: h.weight ?? null,
    is_active: h.is_active, farrier: h.farrier ?? null,
    flags: hFlagsByHorse[h.name] || [],
  }))

  const patternVisits: PatternVisit[] = visits.map((v: any) => ({
    visit_date: v.visit_date, farrier_name: v.farrier_name ?? null,
    farrier_visit_horses: v.farrier_visit_horses || [],
  }))

  const checkInDates = guests.map(g => g.check_in_date).filter(Boolean) as string[]
  const earliestCI = checkInDates.length > 0 ? [...checkInDates].sort()[0] : weekStart
  const weatherFrom = earliestCI < nextStart ? earliestCI : nextStart

  const [{ map: weatherAllMap }, { map: forecastMap }] = await Promise.all([
    fetchWeather(weatherFrom, weekEnd, weekEnd),
    fetchWeather(nextStart, nextEnd, weekEnd),
  ])

  const { findings } = runAllDetectors({
    guests: guests as PatternGuest[],
    flags:  flags  as PatternFlag[],
    visits: patternVisits,
    horses: patternHorses,
    weatherMap: weatherAllMap,
    today: weekEnd,
  })

  const topFindings = findings
    .filter(f => f.kind === 'action')
    .slice(0, 5)
    .map(f => ({ id: f.id, title: f.title, detail: f.detail, category: f.category }))

  // ── Week ahead ─────────────────────────────────────────────────────────────

  const forecast = Object.entries(forecastMap)
    .filter(([d]) => d >= nextStart && d <= nextEnd)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, w]) => ({ date, high_f: w.highF, rain_in: w.rainIn }))

  const nextWeekHolidays = holidaysInRange(nextStart, nextEnd)
  const schoolBreak = schoolBreakFor(nextStart)

  const nextWeekGuestCount = guests.filter(g =>
    g.check_in_date <= nextEnd && g.check_out_date >= nextStart
  ).length

  // ── Compose ────────────────────────────────────────────────────────────────

  return {
    week: { start: weekStart, end: weekEnd },
    guests: {
      ...curStats,
      on_property_prev:    prevStats.on_property,
      arrivals_prev:       prevStats.arrivals,
      checkouts_prev:      prevStats.checkouts,
      kids_under_13_prev:  prevStats.kids_under_13,
      riders_200_plus_prev:prevStats.riders_200_plus,
      level_mix_prev:      prevStats.level_mix,
    },
    horses: {
      busiest: busiestCur,
      busiest_prev: busiestPrev,
      idle_14_plus: idleHorses,
    },
    swaps: {
      total: curSwaps.length,
      total_prev: prevSwapCount,
      by_category: Object.entries(swapByCat).map(([category, v]) => ({ category, ...v })),
    },
    health: {
      opened: openedFlags.map((f: any) => ({
        horse: f.horse_name, type: f.flag_type, date: f.flagged_at?.slice(0, 10),
      })),
      opened_count_prev: openedFlagsPrevCount,
      active: activeHealthFlags,
    },
    farrier: {
      visits: weekVisits.map((v: any) => ({
        date: v.visit_date,
        farrier: v.farrier_name,
        horses: (v.farrier_visit_horses || []).map((h: any) => ({ name: h.horse_name, work: h.work_done })),
      })),
      visits_count_prev: prevVisitCount,
      overdue: overdueHorses,
      overdue_count_prev: overdueHorsesPrevCount,
    },
    patterns: topFindings,
    week_ahead: {
      weather: forecast,
      holidays: nextWeekHolidays,
      school_break: schoolBreak?.label || null,
      guests_next_week: nextWeekGuestCount,
    },
  }
}
