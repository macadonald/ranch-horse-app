import { DetectorResult, PatternFlag, PatternGuest } from './types'

function toYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return toYMD(d)
}

const HEALTH_FLAG_TYPES = ['lame', 'injured', 'stiff_sore']

export function detectHealth(guests: PatternGuest[], flags: PatternFlag[]): DetectorResult {
  const findings: DetectorResult['findings'] = []

  const lameFlags   = flags.filter(f => f.flag_type === 'lame')
  const healthFlags = flags.filter(f => HEALTH_FLAG_TYPES.includes(f.flag_type))

  const status: DetectorResult['status'] = {
    category: 'health',
    checked: `${healthFlags.length} health flag${healthFlags.length !== 1 ? 's' : ''} (lame/injured/stiff)`,
  }

  if (healthFlags.length === 0) return { findings, status }

  // Build per-horse guest-day data from non-incompatible assignments
  type GD = { date: string; weight: number | null }
  const horseGDs: Record<string, GD[]> = {}

  guests.forEach(g => {
    if (!g.check_in_date) return
    ;(g.horse_assignments || []).filter(a => !a.incompatible).forEach(a => {
      if (!horseGDs[a.horse_name]) horseGDs[a.horse_name] = []
      horseGDs[a.horse_name].push({ date: g.check_in_date!, weight: g.weight })
    })
  })

  function typicalStats(horseName: string): { gdsPerDay: number; avgWeight: number | null } {
    const gds = horseGDs[horseName]
    if (!gds || gds.length === 0) return { gdsPerDay: 0, avgWeight: null }
    const dates = gds.map(d => d.date).sort()
    const span = Math.max(1,
      (new Date(dates[dates.length - 1] + 'T12:00:00').getTime() -
       new Date(dates[0] + 'T12:00:00').getTime()) / 86400000 + 1
    )
    const weighted = gds.filter(d => d.weight && d.weight > 0)
    return {
      gdsPerDay: gds.length / span,
      avgWeight: weighted.length > 0
        ? weighted.reduce((s, d) => s + d.weight!, 0) / weighted.length
        : null,
    }
  }

  function isAboveTypical(horseName: string, flagDate: string): boolean {
    const winStart = addDays(flagDate, -21)
    const winEnd   = addDays(flagDate, -1)
    const gds = horseGDs[horseName] || []
    const preGDs = gds.filter(d => d.date >= winStart && d.date <= winEnd)
    const typical = typicalStats(horseName)
    const preWeighted = preGDs.filter(d => d.weight && d.weight > 0)
    const preAvgWeight = preWeighted.length > 0
      ? preWeighted.reduce((s, d) => s + d.weight!, 0) / preWeighted.length
      : null
    return preGDs.length > typical.gdsPerDay * 21 ||
           (typical.avgWeight !== null && preAvgWeight !== null && preAvgWeight > typical.avgWeight)
  }

  // 1. Herd-level: lame events preceded by above-typical load (background)
  if (lameFlags.length >= 5) {
    const aboveCount = lameFlags.filter(f => isAboveTypical(f.horse_name, f.flagged_at.slice(0, 10))).length
    const pct = aboveCount / lameFlags.length
    if (pct >= 0.6) {
      findings.push({
        id: 'health.lame-load',
        kind: 'background',
        category: 'health',
        title: 'Most lameness events follow above-typical load weeks',
        detail: `${Math.round(pct * 100)}% of ${lameFlags.length} lame flags were preceded by higher-than-usual guest load or rider weight`,
        n: lameFlags.length,
        nLabel: `${lameFlags.length} lame events`,
        strength: pct >= 0.75 ? 'strong' : 'moderate',
        facts: { aboveTypical: aboveCount, total: lameFlags.length, pct: Math.round(pct * 100) },
      })
    }
  }

  // 2. Per-horse: 2+ lame events, all above-typical (action)
  const byHorseLame: Record<string, { total: number; above: number }> = {}
  lameFlags.forEach(f => {
    const above = isAboveTypical(f.horse_name, f.flagged_at.slice(0, 10))
    if (!byHorseLame[f.horse_name]) byHorseLame[f.horse_name] = { total: 0, above: 0 }
    byHorseLame[f.horse_name].total++
    if (above) byHorseLame[f.horse_name].above++
  })

  const perHorseHits = Object.entries(byHorseLame)
    .filter(([, v]) => v.total >= 2 && v.above >= v.total)
    .sort(([, a], [, b]) => b.total - a.total)

  if (perHorseHits.length > 0) {
    const [topHorse, topData] = perHorseHits[0]
    const count = perHorseHits.length
    findings.push({
      id: 'health.lame-horse',
      kind: 'action',
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
      facts: { topHorse, topCount: topData.total, totalHorses: count },
    })
  }

  // 3. Repeat flags: horses with 3+ lame/injured/stiff_sore (action)
  const byHorseHealth: Record<string, { total: number; above: number }> = {}
  healthFlags.forEach(f => {
    const above = isAboveTypical(f.horse_name, f.flagged_at.slice(0, 10))
    if (!byHorseHealth[f.horse_name]) byHorseHealth[f.horse_name] = { total: 0, above: 0 }
    byHorseHealth[f.horse_name].total++
    if (above) byHorseHealth[f.horse_name].above++
  })

  const repeatHits = Object.entries(byHorseHealth)
    .filter(([, v]) => v.total >= 3)
    .sort(([, a], [, b]) => b.total - a.total)

  if (repeatHits.length > 0) {
    const top3Names = repeatHits.slice(0, 3).map(([n]) => n)
    const nameList  = top3Names.join(', ') + (repeatHits.length > 3 ? ` +${repeatHits.length - 3} more` : '')
    const [topName, topData] = repeatHits[0]
    const topAbovePct = Math.round(topData.above / topData.total * 100)

    findings.push({
      id: 'health.repeat-flags',
      kind: 'action',
      category: 'health',
      title: repeatHits.length === 1
        ? `${topName} has ${topData.total} health flags (lame/injured/stiff)`
        : `${repeatHits.length} horses have repeated health flags`,
      detail: `${nameList} · ${topAbovePct}% of ${topName}'s flags followed high-load periods`,
      n: repeatHits.reduce((s, [, v]) => s + v.total, 0),
      nLabel: `${repeatHits.reduce((s, [, v]) => s + v.total, 0)} health flags`,
      strength: repeatHits[0][1].total >= 5 ? 'strong' : 'moderate',
      facts: { repeatHorses: repeatHits.length, topHorse: topName, topTotal: topData.total },
    })
  }

  return { findings, status }
}
