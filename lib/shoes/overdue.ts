const MS = 86400000

function daysBetween(a: string, b: string): number {
  return Math.round(
    (new Date(b + 'T12:00:00Z').getTime() - new Date(a + 'T12:00:00Z').getTime()) / MS
  )
}

export type OverdueHorse = {
  name: string
  last_full_set: string
  days_since: number
  usual_gap: number
  days_overdue: number
}

/**
 * Returns active horses past their average full-set shoeing interval.
 * Only horses with 2+ full sets (= 1 measurable interval) are considered.
 * bufferDays (default 14) is added to the average gap before flagging.
 */
export function computeOverdueHorses(
  activeHorseNames: Iterable<string>,
  fullSetsByHorse: Record<string, string[]>,
  asOf: string,
  bufferDays = 14,
): OverdueHorse[] {
  const result: OverdueHorse[] = []
  for (const name of Array.from(activeHorseNames)) {
    const dates = (fullSetsByHorse[name] || []).filter(d => d <= asOf).sort()
    if (dates.length < 2) continue
    const lastFS = dates[dates.length - 1]
    const daysSince = daysBetween(lastFS, asOf)
    let total = 0
    for (let i = 1; i < dates.length; i++) total += daysBetween(dates[i - 1], dates[i])
    const avgGap = Math.round(total / (dates.length - 1))
    if (avgGap > 0 && daysSince > avgGap + bufferDays) {
      result.push({ name, last_full_set: lastFS, days_since: daysSince, usual_gap: avgGap, days_overdue: daysSince - avgGap })
    }
  }
  return result.sort((a, b) => b.days_overdue - a.days_overdue)
}
