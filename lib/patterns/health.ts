import { Finding, PatternFlag, PatternGuest } from './types'

function toYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return toYMD(d)
}

export function detectHealth(guests: PatternGuest[], flags: PatternFlag[]): Finding[] {
  const findings: Finding[] = []

  const lameFlags = flags.filter(f => f.flag_type === 'lame')
  if (lameFlags.length === 0) return findings

  // Build per-horse guest-day data from non-incompatible assignments
  // A "guest-day" for a horse = one non-incompatible assignment with a known check_in_date
  type GD = { date: string; weight: number | null }
  const horseGDs: Record<string, GD[]> = {}

  guests.forEach(g => {
    if (!g.check_in_date) return
    const cin = g.check_in_date
    ;(g.horse_assignments || []).filter(a => !a.incompatible).forEach(a => {
      if (!horseGDs[a.horse_name]) horseGDs[a.horse_name] = []
      horseGDs[a.horse_name].push({ date: cin, weight: g.weight })
    })
  })

  // Per-horse typical stats
  function typicalStats(horseName: string): { gdsPerDay: number; avgWeight: number | null } {
    const gds = horseGDs[horseName]
    if (!gds || gds.length === 0) return { gdsPerDay: 0, avgWeight: null }
    // Days spanned
    const dates = gds.map(d => d.date).sort()
    const span = Math.max(1,
      (new Date(dates[dates.length - 1] + 'T12:00:00').getTime() -
       new Date(dates[0] + 'T12:00:00').getTime()) / 86400000 + 1
    )
    const gdsPerDay = gds.length / span
    const weighted = gds.filter(d => d.weight && d.weight > 0)
    const avgWeight = weighted.length > 0
      ? weighted.reduce((s, d) => s + d.weight!, 0) / weighted.length
      : null
    return { gdsPerDay, avgWeight }
  }

  // Check if a lame event was preceded by above-typical load
  function isAboveTypical(horseName: string, flagDate: string): boolean {
    const winStart = addDays(flagDate, -21)
    const winEnd   = addDays(flagDate, -1)

    const gds = horseGDs[horseName] || []
    const preGDs = gds.filter(d => d.date >= winStart && d.date <= winEnd)

    const typical = typicalStats(horseName)

    // Pre-window guest-days vs typical 21-day window
    const typical21 = typical.gdsPerDay * 21
    const preCount = preGDs.length

    // Pre-window avg weight
    const preWeighted = preGDs.filter(d => d.weight && d.weight > 0)
    const preAvgWeight = preWeighted.length > 0
      ? preWeighted.reduce((s, d) => s + d.weight!, 0) / preWeighted.length
      : null

    const highLoad = preCount > typical21
    const highWeight = typical.avgWeight !== null && preAvgWeight !== null && preAvgWeight > typical.avgWeight

    return highLoad || highWeight
  }

  // Herd-level: pct of lame events preceded by above-typical load
  const aboveTypicalCount = lameFlags.filter(f => {
    const flagDate = f.flagged_at.slice(0, 10)
    return isAboveTypical(f.horse_name, flagDate)
  }).length

  const total = lameFlags.length
  const pct = total > 0 ? aboveTypicalCount / total : 0

  if (total >= 5 && pct >= 0.6) {
    findings.push({
      id: 'health.lame-load',
      category: 'health',
      title: 'Most lameness events follow above-typical load weeks',
      detail: `${Math.round(pct * 100)}% of ${total} lame flags were preceded by higher-than-usual guest load or rider weight`,
      n: total,
      nLabel: `${total} lame events`,
      strength: pct >= 0.75 ? 'strong' : 'moderate',
      facts: {
        aboveTypical: aboveTypicalCount,
        total,
        pct: Math.round(pct * 100),
      },
    })
  }

  // Per-horse: 2+ lame events, both above-typical
  const byHorse: Record<string, { total: number; above: number }> = {}
  lameFlags.forEach(f => {
    const flagDate = f.flagged_at.slice(0, 10)
    const above = isAboveTypical(f.horse_name, flagDate)
    if (!byHorse[f.horse_name]) byHorse[f.horse_name] = { total: 0, above: 0 }
    byHorse[f.horse_name].total++
    if (above) byHorse[f.horse_name].above++
  })

  const perHorseHits = Object.entries(byHorse)
    .filter(([, v]) => v.total >= 2 && v.above >= v.total)
    .sort(([, a], [, b]) => b.total - a.total)

  if (perHorseHits.length > 0) {
    const [topHorse, topData] = perHorseHits[0]
    const count = perHorseHits.length
    findings.push({
      id: 'health.lame-horse',
      category: 'health',
      title: count === 1
        ? `${topHorse} goes lame after heavy-load periods`
        : `${count} horses go lame after heavy-load periods`,
      detail: count === 1
        ? `${topData.total} lame events, each following above-typical load or weight`
        : `${topHorse} and ${count - 1} other${count > 2 ? 's' : ''} each had all lame events follow high-load weeks`,
      n: perHorseHits.reduce((s, [, v]) => s + v.total, 0),
      nLabel: `${perHorseHits.reduce((s, [, v]) => s + v.total, 0)} lame events across ${count} horse${count > 1 ? 's' : ''}`,
      strength: 'moderate',
      facts: {
        topHorse,
        topCount: topData.total,
        totalHorses: count,
      },
    })
  }

  return findings
}
