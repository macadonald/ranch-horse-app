import { DetectorResult, PatternGuest, PatternHorse, PatternVisit } from './types'
import { isFullSet, categorizeWork } from '@/lib/shoeWork'

const MS = 24 * 60 * 60 * 1000

function isTouchUp(work_done: string): boolean {
  const cat = categorizeWork(work_done)
  return cat === 'fronts' || cat === 'rears' || cat === 'partial'
}

export function detectShoes(
  guests: PatternGuest[],
  visits: PatternVisit[],
  horses: PatternHorse[],
  today: string,
): DetectorResult {
  const findings: DetectorResult['findings'] = []

  // Full-set dates per horse (sorted ascending)
  const fullSetsByHorse: Record<string, string[]> = {}
  visits.forEach(v => {
    v.farrier_visit_horses.forEach(vh => {
      if (isFullSet(vh.work_done)) {
        if (!fullSetsByHorse[vh.horse_name]) fullSetsByHorse[vh.horse_name] = []
        fullSetsByHorse[vh.horse_name].push(v.visit_date)
      }
    })
  })
  Object.values(fullSetsByHorse).forEach(dates => dates.sort())

  const activeNames = new Set(horses.filter(h => h.is_active).map(h => h.name))
  const cycleCount = Object.values(fullSetsByHorse).reduce((s, d) => s + Math.max(0, d.length - 1), 0)

  const status: DetectorResult['status'] = {
    category: 'shoes',
    checked: `${activeNames.size} active horses, ${cycleCount} shoeing cycles`,
  }

  // Visit list per horse for touch-up detection
  const visitsByHorse: Record<string, Array<{ date: string; work_done: string }>> = {}
  visits.forEach(v => {
    v.farrier_visit_horses.forEach(vh => {
      if (!visitsByHorse[vh.horse_name]) visitsByHorse[vh.horse_name] = []
      visitsByHorse[vh.horse_name].push({ date: v.visit_date, work_done: vh.work_done })
    })
  })

  // Guest-days per horse with weight (for rider-weight detector)
  type GD = { date: string; weight: number | null }
  const horseGDs: Record<string, GD[]> = {}
  guests.forEach(g => {
    if (!g.check_in_date) return
    ;(g.horse_assignments || []).filter(a => !a.incompatible).forEach(a => {
      if (!horseGDs[a.horse_name]) horseGDs[a.horse_name] = []
      horseGDs[a.horse_name].push({ date: g.check_in_date!, weight: g.weight })
    })
  })

  // ── 1. Rider weight vs touch-ups per cycle (action) ───────────────────────
  const weightCycles: Array<{ touchUps: number; avgWeight: number | null }> = []
  Object.entries(fullSetsByHorse).forEach(([horseName, fullDates]) => {
    const allV = (visitsByHorse[horseName] || []).sort((a, b) => a.date.localeCompare(b.date))
    const gds  = horseGDs[horseName] || []
    for (let i = 0; i < fullDates.length - 1; i++) {
      const cs = fullDates[i], ce = fullDates[i + 1]
      const touchUps = allV.filter(v => v.date > cs && v.date < ce && isTouchUp(v.work_done)).length
      const cgds = gds.filter(d => d.date >= cs && d.date < ce && d.weight && d.weight > 0)
      const avgWeight = cgds.length > 0
        ? cgds.reduce((s, d) => s + d.weight!, 0) / cgds.length
        : null
      weightCycles.push({ touchUps, avgWeight })
    }
  })

  const heavy = weightCycles.filter(c => c.avgWeight !== null && c.avgWeight >= 200)
  const light = weightCycles.filter(c => c.avgWeight !== null && c.avgWeight  < 200)
  if (heavy.length >= 15 && light.length >= 15) {
    const avgHeavy = heavy.reduce((s, c) => s + c.touchUps, 0) / heavy.length
    const avgLight = light.reduce((s, c) => s + c.touchUps, 0) / light.length
    if (avgLight > 0) {
      const ratio = avgHeavy / avgLight
      if (ratio >= 1.3) {
        findings.push({
          id: 'shoes.touchup-weight',
          kind: 'action',
          category: 'shoes',
          title: 'Heavier riders (200+ lb avg) lead to more shoe touch-ups per cycle',
          detail: `${avgHeavy.toFixed(1)} touch-ups/cycle for 200+ lb avg vs ${avgLight.toFixed(1)} for lighter (${heavy.length} vs ${light.length} cycles)`,
          n: heavy.length + light.length,
          nLabel: `${heavy.length + light.length} shoeing cycles`,
          strength: ratio >= 1.6 ? 'strong' : 'moderate',
          facts: {
            avgHeavy: Math.round(avgHeavy * 100) / 100,
            avgLight: Math.round(avgLight * 100) / 100,
            ratio: Math.round(ratio * 100) / 100,
            heavyCycles: heavy.length,
            lightCycles: light.length,
          },
        })
      }
    }
  }

  // ── 2. Past usual gap: active horses overdue (action) ─────────────────────
  const pastGap: Array<{ name: string; daysPast: number }> = []
  activeNames.forEach(name => {
    const dates = fullSetsByHorse[name]
    if (!dates || dates.length < 2) return
    let totalDays = 0
    for (let i = 1; i < dates.length; i++) {
      totalDays += Math.round(
        (new Date(dates[i] + 'T12:00:00').getTime() - new Date(dates[i - 1] + 'T12:00:00').getTime()) / MS
      )
    }
    const avgDays = totalDays / (dates.length - 1)
    const lastFS  = dates[dates.length - 1]
    const curDays = Math.round(
      (new Date(today + 'T12:00:00').getTime() - new Date(lastFS + 'T12:00:00').getTime()) / MS
    )
    if (curDays > avgDays) {
      pastGap.push({ name, daysPast: Math.round(curDays - avgDays) })
    }
  })
  pastGap.sort((a, b) => b.daysPast - a.daysPast)

  if (pastGap.length >= 3) {
    const top5 = pastGap.slice(0, 5)
    const nameList = top5.map(h => `${h.name} (+${h.daysPast}d)`).join(', ')
    findings.push({
      id: 'shoes.past-usual-gap',
      kind: 'action',
      category: 'shoes',
      title: `${pastGap.length} active horses are past their usual shoeing interval`,
      detail: nameList + (pastGap.length > 5 ? ` +${pastGap.length - 5} more` : ''),
      n: pastGap.length,
      nLabel: `${pastGap.length} horses overdue`,
      strength: pastGap.length >= 6 ? 'strong' : 'moderate',
      facts: { count: pastGap.length, topHorse: top5[0].name, topDaysPast: top5[0].daysPast },
    })
  }

  // ── 3. Farrier difference (action) ────────────────────────────────────────
  type FarrierCycle = { farrier: string; days: number; touchUps: number }
  const farrierCycles: FarrierCycle[] = []

  Object.entries(fullSetsByHorse).forEach(([horseName, fullDates]) => {
    for (let i = 0; i < fullDates.length - 1; i++) {
      const cycleStart = fullDates[i], cycleEnd = fullDates[i + 1]
      const startVisit = visits.find(v =>
        v.visit_date === cycleStart &&
        v.farrier_name &&
        v.farrier_visit_horses.some(vh => vh.horse_name === horseName && isFullSet(vh.work_done))
      )
      if (!startVisit?.farrier_name) continue
      const farrier  = startVisit.farrier_name.trim().toLowerCase()
      const days     = Math.round(
        (new Date(cycleEnd + 'T12:00:00').getTime() - new Date(cycleStart + 'T12:00:00').getTime()) / MS
      )
      const touchUps = visits.filter(v =>
        v.visit_date > cycleStart && v.visit_date < cycleEnd &&
        v.farrier_visit_horses.some(vh => vh.horse_name === horseName && isTouchUp(vh.work_done))
      ).length
      farrierCycles.push({ farrier, days, touchUps })
    }
  })

  const byFarrier: Record<string, FarrierCycle[]> = {}
  farrierCycles.forEach(c => {
    if (!byFarrier[c.farrier]) byFarrier[c.farrier] = []
    byFarrier[c.farrier].push(c)
  })

  const qualified = Object.entries(byFarrier).filter(([, cs]) => cs.length >= 10)
  if (qualified.length >= 2) {
    const stats = qualified.map(([name, cs]) => ({
      name, count: cs.length,
      avgDays: cs.reduce((s, c) => s + c.days, 0) / cs.length,
      avgTU:   cs.reduce((s, c) => s + c.touchUps, 0) / cs.length,
    }))

    let bestFinding: (typeof findings)[number] | null = null
    let bestScore = 0

    for (let i = 0; i < stats.length; i++) {
      for (let j = i + 1; j < stats.length; j++) {
        const a = stats[i], b = stats[j]
        const maxDays  = Math.max(a.avgDays, b.avgDays)
        const daysDiff = maxDays > 0 ? Math.abs(a.avgDays - b.avgDays) / maxDays : 0
        const minTU    = Math.min(a.avgTU, b.avgTU)
        const tuRatio  = minTU > 0 ? Math.max(a.avgTU, b.avgTU) / minTU : 0
        if (daysDiff < 0.2 && tuRatio < 1.3) continue
        const score = daysDiff + (tuRatio - 1)
        if (score <= bestScore) continue
        bestScore = score
        const [s1, s2] = a.avgDays < b.avgDays ? [a, b] : [b, a]
        const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
        bestFinding = {
          id: 'shoes.farrier-difference',
          kind: 'action',
          category: 'shoes',
          title: 'Shoe cycles differ noticeably between farriers',
          detail: `${cap(s1.name)}: ${Math.round(s1.avgDays)}d avg, ${s1.avgTU.toFixed(1)} touch-ups/cycle · ${cap(s2.name)}: ${Math.round(s2.avgDays)}d, ${s2.avgTU.toFixed(1)}`,
          n: s1.count + s2.count,
          nLabel: `${s1.count + s2.count} cycles across ${stats.length} farrier${stats.length > 1 ? 's' : ''}`,
          strength: (daysDiff >= 0.3 || tuRatio >= 1.6) ? 'strong' : 'moderate',
          facts: {
            farrier1: s1.name, farrier2: s2.name,
            days1: Math.round(s1.avgDays), days2: Math.round(s2.avgDays),
            tu1: Math.round(s1.avgTU * 10) / 10, tu2: Math.round(s2.avgTU * 10) / 10,
          },
        }
      }
    }
    if (bestFinding) findings.push(bestFinding)
  }

  return { findings, status }
}
