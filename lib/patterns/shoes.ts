import { Finding, PatternGuest, PatternVisit } from './types'
import { isFullSet } from '@/lib/shoeWork'

export function detectShoes(guests: PatternGuest[], visits: PatternVisit[]): Finding[] {
  const findings: Finding[] = []

  // Build per-horse full-set dates (sorted)
  const fullSetsByHorse: Record<string, string[]> = {}
  visits.forEach(v => {
    v.farrier_visit_horses.forEach(vh => {
      if (isFullSet(vh.work_done)) {
        if (!fullSetsByHorse[vh.horse_name]) fullSetsByHorse[vh.horse_name] = []
        fullSetsByHorse[vh.horse_name].push(v.visit_date)
      }
    })
  })

  // Build all visits per horse (for touch-up detection)
  const visitsByHorse: Record<string, Array<{ date: string; work_done: string }>> = {}
  visits.forEach(v => {
    v.farrier_visit_horses.forEach(vh => {
      if (!visitsByHorse[vh.horse_name]) visitsByHorse[vh.horse_name] = []
      visitsByHorse[vh.horse_name].push({ date: v.visit_date, work_done: vh.work_done })
    })
  })

  // Build non-incompatible guest-days per horse with weight
  type GD = { date: string; weight: number | null }
  const horseGDs: Record<string, GD[]> = {}
  guests.forEach(g => {
    if (!g.check_in_date) return
    ;(g.horse_assignments || []).filter(a => !a.incompatible).forEach(a => {
      if (!horseGDs[a.horse_name]) horseGDs[a.horse_name] = []
      horseGDs[a.horse_name].push({ date: g.check_in_date!, weight: g.weight })
    })
  })

  // A touch-up is a fronts/rears/partial — any non-full-set farrier visit
  function isTouchUp(work_done: string): boolean {
    const w = work_done.toLowerCase()
    return w.includes('front') || w.includes('rear') || w.includes('partial') ||
           (w.includes('reset') && !isFullSet(work_done))
  }

  // Per cycle: [cycleStart=fullSetDate, cycleEnd=nextFullSetDate)
  // Count touch-ups in that window; avg rider weight from guest-days in window
  type Cycle = { touchUps: number; avgWeight: number | null }
  const cycles: Cycle[] = []

  Object.entries(fullSetsByHorse).forEach(([horseName, fullDates]) => {
    const sorted = [...fullDates].sort()
    const allHorseVisits = (visitsByHorse[horseName] || []).sort((a, b) => a.date.localeCompare(b.date))
    const gds = horseGDs[horseName] || []

    for (let i = 0; i < sorted.length - 1; i++) {
      const cycleStart = sorted[i]
      const cycleEnd   = sorted[i + 1]

      // Touch-ups: visits strictly between full sets (exclude the full-set visits themselves)
      const touchUps = allHorseVisits.filter(
        v => v.date > cycleStart && v.date < cycleEnd && isTouchUp(v.work_done)
      ).length

      // Avg rider weight during this cycle
      const cycleGDs = gds.filter(d => d.date >= cycleStart && d.date < cycleEnd && d.weight && d.weight > 0)
      const avgWeight = cycleGDs.length > 0
        ? cycleGDs.reduce((s, d) => s + d.weight!, 0) / cycleGDs.length
        : null

      cycles.push({ touchUps, avgWeight })
    }
  })

  const heavy = cycles.filter(c => c.avgWeight !== null && c.avgWeight >= 200)
  const light = cycles.filter(c => c.avgWeight !== null && c.avgWeight  < 200)

  if (heavy.length < 15 || light.length < 15) return findings

  const avgHeavy = heavy.reduce((s, c) => s + c.touchUps, 0) / heavy.length
  const avgLight = light.reduce((s, c) => s + c.touchUps, 0) / light.length

  if (avgLight === 0) return findings

  const ratio = avgHeavy / avgLight
  if (ratio < 1.3) return findings

  findings.push({
    id: 'shoes.touchup-weight',
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

  return findings
}
