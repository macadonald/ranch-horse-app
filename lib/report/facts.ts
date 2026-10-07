import { LEVEL_LABELS } from '@/lib/horses'
import { WEIGHT_BANDS, getWeightBand } from '@/lib/weightBands'
import { categorizeWork, isFullSet } from '@/lib/shoeWork'
import { runAllDetectors } from '@/lib/patterns/index'
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

export async function buildRangeFacts(
  supabase: any,
  start: string,
  end: string,
  sections: string[],
): Promise<any> {
  const has = (s: string) => sections.includes(s)

  const needHealth   = has('health') || has('patterns')
  const needShoes    = has('shoes') || has('patterns') || has('horses')

  const [
    { data: guestsRaw },
    { data: horsesRaw },
    { data: flagsRaw },
    { data: visitsRaw },
    { data: activeFlagsRaw },
    { data: groupsRaw },
  ] = await Promise.all([
    supabase.from('guests').select(
      'id, name, check_in_date, check_out_date, age, weight, gender, riding_level, repeat_guest, group_id, horse_assignments(horse_name, incompatible, status, removed_at, swap_category, swap_reason, reason, assigned_at)'
    ).limit(10000),
    supabase.from('horses').select('name, level, weight, is_active, is_draft, farrier').limit(500),
    needHealth
      ? supabase.from('horse_status_flags').select('horse_name, flag_type, status, flagged_at, day_off_date, resolved_at, notes').order('flagged_at', { ascending: false })
      : Promise.resolve({ data: [] }),
    needShoes
      ? supabase.from('farrier_visits').select('visit_date, farrier_name, farrier_visit_horses(horse_name, work_done)').order('visit_date', { ascending: false }).limit(5000)
      : Promise.resolve({ data: [] }),
    supabase.from('horse_status_flags').select('horse_name, flag_type, status, day_off_date, flagged_at').eq('status', 'active'),
    has('guests')
      ? supabase.from('guest_groups').select('id, name')
      : Promise.resolve({ data: [] }),
  ])

  const guests       = (guestsRaw      || []) as any[]
  const allHorses    = (horsesRaw      || []) as any[]
  const flags        = (flagsRaw       || []) as any[]
  const visits       = (visitsRaw      || []) as any[]
  const activeFlags  = (activeFlagsRaw || []) as any[]
  const groups       = (groupsRaw      || []) as any[]
  const activeHorses = allHorses.filter((h: any) => h.is_active)

  const rangeGuests = guests.filter(g =>
    g.check_in_date != null && g.check_out_date != null &&
    g.check_in_date <= end && g.check_out_date >= start
  )

  const result: any = { range: { start, end } }

  // ── Guests ────────────────────────────────────────────────────────────────────

  if (has('guests')) {
    const arrivals = rangeGuests.filter(g => g.check_in_date >= start && g.check_in_date <= end).length

    const stays = rangeGuests.map(g => {
      const s = g.check_in_date > start ? g.check_in_date : start
      const e = g.check_out_date < end  ? g.check_out_date : end
      return Math.max(1, daysBetween(s, e) + 1)
    })
    const avgStay = stays.length
      ? Math.round(stays.reduce((a, b) => a + b, 0) / stays.length)
      : 0

    // Guests per week series
    const guestsPerWeek: { week: string; count: number }[] = []
    let wStart = start
    while (wStart <= end) {
      const wEnd = addDays(wStart, 6) <= end ? addDays(wStart, 6) : end
      const count = rangeGuests.filter(g => g.check_in_date <= wEnd && g.check_out_date >= wStart).length
      guestsPerWeek.push({ week: wStart, count })
      const next = addDays(wStart, 7)
      if (next > end) break
      wStart = next
    }

    // Weight band mix
    const weightBandMix: { label: string; count: number }[] = WEIGHT_BANDS.map(b => ({
      label: b.label,
      count: rangeGuests.filter(g => {
        const band = getWeightBand(g.weight)
        return band?.key === b.key
      }).length,
    }))

    // Level mix
    const levelMix: Record<string, number> = {}
    for (const g of rangeGuests) {
      const lbl = LEVEL_LABELS[g.riding_level] || g.riding_level || 'unknown'
      levelMix[lbl] = (levelMix[lbl] || 0) + 1
    }

    const kids   = rangeGuests.filter(g => g.age != null && g.age < 13).length
    const teens  = rangeGuests.filter(g => g.age != null && g.age >= 13 && g.age < 18).length
    const adults = rangeGuests.filter(g => g.age == null || g.age >= 18).length
    const repeatCount = rangeGuests.filter(g => g.repeat_guest).length

    // Top groups
    const groupNameMap: Record<string, string> = {}
    for (const grp of groups) groupNameMap[grp.id] = grp.name
    const groupCounts: Record<string, number> = {}
    for (const g of rangeGuests) {
      if (g.group_id && groupNameMap[g.group_id]) {
        groupCounts[groupNameMap[g.group_id]] = (groupCounts[groupNameMap[g.group_id]] || 0) + 1
      }
    }
    const topGroups = Object.entries(groupCounts)
      .sort(([, a], [, b]) => (b as number) - (a as number))
      .slice(0, 5)
      .map(([name, count]) => ({ name, count: count as number }))

    result.guests = {
      total: rangeGuests.length,
      arrivals,
      avg_stay_days: avgStay,
      guests_per_week: guestsPerWeek,
      weight_band_mix: weightBandMix,
      level_mix: Object.entries(levelMix)
        .sort(([, a], [, b]) => (b as number) - (a as number))
        .map(([level, count]) => ({ level, count })),
      kids,
      teens,
      adults,
      repeat_share_pct: rangeGuests.length
        ? Math.round((repeatCount / rangeGuests.length) * 100)
        : 0,
      top_groups: topGroups,
    }
  }

  // ── Horses ────────────────────────────────────────────────────────────────────

  if (has('horses')) {
    // Top 10 by guest-days
    const dayMap: Record<string, number> = {}
    for (const g of rangeGuests) {
      const gS = g.check_in_date > start ? g.check_in_date : start
      const gE = g.check_out_date < end  ? g.check_out_date : end
      const overlap = Math.max(1, daysBetween(gS, gE) + 1)
      const seen = new Set<string>()
      for (const a of g.horse_assignments || []) {
        if (a.incompatible || a.status === 'removed') continue
        if (!seen.has(a.horse_name)) {
          seen.add(a.horse_name)
          dayMap[a.horse_name] = (dayMap[a.horse_name] || 0) + overlap
        }
      }
    }
    const topByGuestDays = Object.entries(dayMap)
      .sort(([, a], [, b]) => (b as number) - (a as number))
      .slice(0, 10)
      .map(([name, guest_days]) => ({ name, guest_days: guest_days as number }))

    // Last assigned date (all-time, for idle calc at range end)
    const lastAssigned: Record<string, string> = {}
    for (const g of guests) {
      for (const a of g.horse_assignments || []) {
        if (a.status === 'removed') continue
        if (!lastAssigned[a.horse_name] || g.check_in_date > lastAssigned[a.horse_name]) {
          lastAssigned[a.horse_name] = g.check_in_date
        }
      }
    }

    const blockedNames = new Set<string>(
      activeFlags.filter((f: any) => f.flag_type !== 'day_off').map((f: any) => f.horse_name as string)
    )

    const idleHorses = activeHorses
      .filter((h: any) => !h.is_draft && !blockedNames.has(h.name))
      .map((h: any) => {
        const last = lastAssigned[h.name] || null
        return { name: h.name, last_assigned: last, days_idle: last ? daysBetween(last, end) : 999 }
      })
      .filter((h: any) => h.days_idle >= 14)
      .sort((a: any, b: any) => b.days_idle - a.days_idle)

    // Draft usage for 200+ lb riders
    const draftMap: Record<string, number> = {}
    const heavyGuests = rangeGuests.filter(g => g.weight != null && g.weight >= 200)
    for (const g of heavyGuests) {
      for (const a of g.horse_assignments || []) {
        if (a.status === 'removed' || a.incompatible) continue
        const horse = allHorses.find((h: any) => h.name === a.horse_name)
        if (horse?.is_draft) {
          draftMap[a.horse_name] = (draftMap[a.horse_name] || 0) + 1
        }
      }
    }
    const draftUsage = Object.entries(draftMap)
      .sort(([, a], [, b]) => (b as number) - (a as number))
      .map(([name, heavy_rider_uses]) => ({ name, heavy_rider_uses: heavy_rider_uses as number }))

    result.horses = {
      top_by_guest_days: topByGuestDays,
      idle_14_plus: idleHorses,
      draft_usage_heavy_riders: draftUsage,
      herd_depth: {
        total_active: activeHorses.length,
        blocked: blockedNames.size,
        available: activeHorses.length - blockedNames.size,
        draft_count: activeHorses.filter((h: any) => h.is_draft).length,
      },
    }
  }

  // ── Swaps ─────────────────────────────────────────────────────────────────────

  if (has('swaps')) {
    const swapRows: any[] = []
    const notAFitRows: any[] = []
    for (const g of rangeGuests) {
      for (const a of g.horse_assignments || []) {
        if (a.status !== 'removed') continue
        const date = (a.removed_at || a.assigned_at || g.check_in_date || '').slice(0, 10)
        swapRows.push({ horse: a.horse_name, guest: g.name, category: a.swap_category || 'uncategorized', reason: a.swap_reason || null, incompatible: !!a.incompatible, date })
        if (a.incompatible) {
          notAFitRows.push({ horse: a.horse_name, guest: g.name, reason: a.reason || a.swap_reason || null, date })
        }
      }
    }

    const byCat: Record<string, number> = {}
    for (const s of swapRows) byCat[s.category] = (byCat[s.category] || 0) + 1

    const byReason: Record<string, number> = {}
    for (const s of swapRows) if (s.reason) byReason[s.reason] = (byReason[s.reason] || 0) + 1

    const horseSwapMap: Record<string, { count: number; reasons: string[] }> = {}
    for (const s of swapRows) {
      if (!horseSwapMap[s.horse]) horseSwapMap[s.horse] = { count: 0, reasons: [] }
      horseSwapMap[s.horse].count++
      if (s.reason && !horseSwapMap[s.horse].reasons.includes(s.reason)) {
        horseSwapMap[s.horse].reasons.push(s.reason)
      }
    }
    const mostSwappedOff = Object.entries(horseSwapMap)
      .sort(([, a], [, b]) => b.count - a.count)
      .slice(0, 10)
      .map(([name, v]) => ({ name, swaps: v.count, reasons: v.reasons }))

    result.swaps = {
      total: swapRows.length,
      by_category: Object.entries(byCat)
        .sort(([, a], [, b]) => (b as number) - (a as number))
        .map(([category, count]) => ({ category, count })),
      by_reason: Object.entries(byReason)
        .sort(([, a], [, b]) => (b as number) - (a as number))
        .map(([reason, count]) => ({ reason, count })),
      most_swapped_off: mostSwappedOff,
      not_a_fit: notAFitRows
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 25),
    }
  }

  // ── Health ────────────────────────────────────────────────────────────────────

  if (has('health')) {
    const openedInRange = flags.filter((f: any) =>
      f.flagged_at >= start + 'T00:00:00' && f.flagged_at <= end + 'T23:59:59'
    )
    const resolvedInRange = flags.filter((f: any) =>
      f.resolved_at && f.resolved_at >= start + 'T00:00:00' && f.resolved_at <= end + 'T23:59:59'
    )

    const openedByType: Record<string, number> = {}
    for (const f of openedInRange) openedByType[f.flag_type] = (openedByType[f.flag_type] || 0) + 1

    const resolvedByType: Record<string, number> = {}
    for (const f of resolvedInRange) resolvedByType[f.flag_type] = (resolvedByType[f.flag_type] || 0) + 1

    const horseFlagCount: Record<string, number> = {}
    for (const f of openedInRange) horseFlagCount[f.horse_name] = (horseFlagCount[f.horse_name] || 0) + 1
    const mostFlagged = Object.entries(horseFlagCount)
      .sort(([, a], [, b]) => (b as number) - (a as number))
      .slice(0, 5)
      .map(([name, count]) => ({ name, flags: count as number }))

    result.health = {
      opened: openedInRange.length,
      resolved: resolvedInRange.length,
      opened_by_type: Object.entries(openedByType)
        .sort(([, a], [, b]) => (b as number) - (a as number))
        .map(([type, count]) => ({ type, count })),
      resolved_by_type: Object.entries(resolvedByType)
        .sort(([, a], [, b]) => (b as number) - (a as number))
        .map(([type, count]) => ({ type, count })),
      most_flagged_horses: mostFlagged,
      open_at_range_end: activeFlags
        .filter((f: any) => f.flag_type !== 'day_off')
        .map((f: any) => ({ horse: f.horse_name, type: f.flag_type, since: f.flagged_at?.slice(0, 10) })),
    }
  }

  // ── Shoes ─────────────────────────────────────────────────────────────────────

  if (has('shoes')) {
    const rangeVisits = visits.filter((v: any) => v.visit_date >= start && v.visit_date <= end)

    const byFarrier: Record<string, { visits: number; horses_seen: number }> = {}
    for (const v of rangeVisits) {
      const f = v.farrier_name || 'Unknown'
      if (!byFarrier[f]) byFarrier[f] = { visits: 0, horses_seen: 0 }
      byFarrier[f].visits++
      byFarrier[f].horses_seen += (v.farrier_visit_horses || []).length
    }

    const workCats: Record<string, number> = {}
    for (const v of rangeVisits) {
      for (const h of v.farrier_visit_horses || []) {
        const cat = categorizeWork(h.work_done)
        workCats[cat] = (workCats[cat] || 0) + 1
      }
    }

    // Full set gap analysis across all history
    const horseFSHistory: Record<string, string[]> = {}
    for (const v of visits) {
      for (const h of v.farrier_visit_horses || []) {
        if (!isFullSet(h.work_done)) continue
        if (!horseFSHistory[h.horse_name]) horseFSHistory[h.horse_name] = []
        horseFSHistory[h.horse_name].push(v.visit_date)
      }
    }

    let totalIntervals = 0, intervalCount = 0
    for (const dates of Object.values(horseFSHistory)) {
      const sorted = (dates as string[]).filter(d => d <= end).sort()
      for (let i = 1; i < sorted.length; i++) {
        totalIntervals += daysBetween(sorted[i - 1], sorted[i])
        intervalCount++
      }
    }
    const avgFullSetGapDays = intervalCount ? Math.round(totalIntervals / intervalCount) : null

    const overdueHorses: any[] = []
    for (const h of activeHorses) {
      const dates = (horseFSHistory[h.name] || []).filter((d: string) => d <= end).sort()
      if (dates.length < 2) continue
      const lastFS = dates[dates.length - 1]
      const daysSince = daysBetween(lastFS, end)
      let total = 0
      for (let i = 1; i < dates.length; i++) total += daysBetween(dates[i - 1], dates[i])
      const avgGap = Math.round(total / (dates.length - 1))
      if (avgGap > 0 && daysSince > avgGap + 14) {
        overdueHorses.push({ name: h.name, last_full_set: lastFS, days_since: daysSince, usual_gap: avgGap, days_overdue: daysSince - avgGap })
      }
    }
    overdueHorses.sort((a, b) => b.days_overdue - a.days_overdue)

    result.shoes = {
      visits_in_range: rangeVisits.length,
      by_farrier: Object.entries(byFarrier)
        .sort(([, a], [, b]) => b.visits - a.visits)
        .map(([farrier, v]) => ({ farrier, ...v })),
      work_categories: Object.entries(workCats)
        .sort(([, a], [, b]) => (b as number) - (a as number))
        .map(([category, count]) => ({ category, count })),
      avg_full_set_gap_days: avgFullSetGapDays,
      overdue_horses: overdueHorses,
    }
  }

  // ── Patterns ─────────────────────────────────────────────────────────────────

  if (has('patterns')) {
    const hFlagsByHorse: Record<string, PatternHorse['flags']> = {}
    for (const f of flags) {
      if (!hFlagsByHorse[f.horse_name]) hFlagsByHorse[f.horse_name] = []
      hFlagsByHorse[f.horse_name].push({
        flag_type: f.flag_type, status: f.status,
        day_off_date: f.day_off_date ?? null, flagged_at: f.flagged_at,
      })
    }

    const patternHorses: PatternHorse[] = allHorses.map((h: any) => ({
      name: h.name, level: h.level, weight: h.weight ?? null,
      is_active: h.is_active, farrier: h.farrier ?? null,
      flags: hFlagsByHorse[h.name] || [],
    }))

    const patternVisits: PatternVisit[] = visits.map((v: any) => ({
      visit_date: v.visit_date, farrier_name: v.farrier_name ?? null,
      farrier_visit_horses: v.farrier_visit_horses || [],
    }))

    const { findings } = runAllDetectors({
      guests: guests as PatternGuest[],
      flags:  flags  as PatternFlag[],
      visits: patternVisits,
      horses: patternHorses,
      weatherMap: {},
      today: end,
    })

    result.patterns = findings
      .filter(f => f.kind === 'action')
      .slice(0, 10)
      .map(f => ({ id: f.id, title: f.title, detail: f.detail, n: f.n, category: f.category }))
  }

  return result
}
