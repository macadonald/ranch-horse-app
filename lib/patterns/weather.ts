import { DetectorResult, PatternGuest } from './types'
import { WeatherMap } from '@/lib/weather'
import { schoolBreakFor } from '@/lib/calendar'

function toYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function getSundayOf(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() - d.getDay())
  return toYMD(d)
}

function pearson(xs: number[], ys: number[]): number | null {
  const n = xs.length
  if (n < 3) return null
  const mx = xs.reduce((a, b) => a + b, 0) / n
  const my = ys.reduce((a, b) => a + b, 0) / n
  let num = 0, dx2 = 0, dy2 = 0
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my
    num += dx * dy; dx2 += dx * dx; dy2 += dy * dy
  }
  const denom = Math.sqrt(dx2 * dy2)
  return denom === 0 ? null : num / denom
}

function buildWeekGuestCounts(guests: PatternGuest[], today: string): Record<string, number> {
  const weekMap: Record<string, number> = {}
  guests.forEach(g => {
    if (!g.check_in_date) return
    const stayEnd = g.check_out_date || g.checked_out_at?.slice(0, 10) || today
    const cinD = new Date(g.check_in_date + 'T12:00:00')
    cinD.setDate(cinD.getDate() - cinD.getDay())
    let cur = toYMD(cinD)
    while (cur <= stayEnd) {
      weekMap[cur] = (weekMap[cur] || 0) + 1
      const next = new Date(cur + 'T12:00:00')
      next.setDate(next.getDate() + 7)
      cur = toYMD(next)
    }
  })
  return weekMap
}

function weekAvgHigh(sundayKey: string, weatherMap: WeatherMap): number | null {
  let sum = 0, count = 0
  for (let i = 0; i < 7; i++) {
    const d = new Date(sundayKey + 'T12:00:00')
    d.setDate(d.getDate() + i)
    const w = weatherMap[toYMD(d)]
    if (w?.highF != null) { sum += w.highF; count++ }
  }
  return count >= 4 ? Math.round(sum / count) : null
}

export function detectWeather(guests: PatternGuest[], weatherMap: WeatherMap, today: string): DetectorResult {
  const findings: DetectorResult['findings'] = []
  const weekGuests = buildWeekGuestCounts(guests, today)
  const todaySun = getSundayOf(today)

  const weekKeys = Object.keys(weekGuests)
    .filter(k => k < todaySun)
    .sort()

  type WeekObs = { guests: number; avgHigh: number }
  const obs: WeekObs[] = weekKeys
    .map(k => ({ guests: weekGuests[k], avgHigh: weekAvgHigh(k, weatherMap) }))
    .filter((o): o is WeekObs => o.avgHigh !== null)

  const status: DetectorResult['status'] = {
    category: 'weather',
    checked: `${obs.length} weeks with weather data`,
  }

  // 1. Pearson correlation (min 12 weeks)
  if (obs.length >= 12) {
    const r = pearson(obs.map(o => o.avgHigh), obs.map(o => o.guests))
    if (r !== null && Math.abs(r) >= 0.4) {
      const direction = r > 0 ? 'Hotter weeks tend to have more guests' : 'Hotter weeks tend to have fewer guests'
      findings.push({
        id: 'weather.temp-guest-corr',
        kind: 'background',
        category: 'weather',
        title: direction,
        detail: `r = ${r.toFixed(2)} across ${obs.length} weeks with weather data`,
        n: obs.length,
        nLabel: `${obs.length} weeks`,
        strength: Math.abs(r) >= 0.6 ? 'strong' : 'moderate',
        facts: { r: Math.round(r * 100) / 100, weeks: obs.length },
      })
    }
  }

  // 2. Hot weeks (avg high >= 100°) vs others
  const hotWeeks   = obs.filter(o => o.avgHigh >= 100)
  const otherWeeks = obs.filter(o => o.avgHigh < 100)
  if (hotWeeks.length >= 3 && otherWeeks.length >= 3) {
    const avgHot   = hotWeeks.reduce((s, o) => s + o.guests, 0)   / hotWeeks.length
    const avgOther = otherWeeks.reduce((s, o) => s + o.guests, 0) / otherWeeks.length
    if (avgOther > 0) {
      const diff = Math.abs(avgHot - avgOther) / avgOther
      if (diff >= 0.25) {
        const dir = avgHot > avgOther ? 'more' : 'fewer'
        findings.push({
          id: 'weather.hot-weeks',
          kind: 'background',
          category: 'weather',
          title: `Weeks above 100° avg high have ${dir} guests`,
          detail: `${avgHot.toFixed(1)} guests/week above 100° vs ${avgOther.toFixed(1)} below (${hotWeeks.length} vs ${otherWeeks.length} weeks)`,
          n: obs.length,
          nLabel: `${hotWeeks.length + otherWeeks.length} weeks`,
          strength: diff >= 0.5 ? 'strong' : 'moderate',
          facts: {
            avgHot: Math.round(avgHot * 10) / 10,
            avgOther: Math.round(avgOther * 10) / 10,
            hotWeeks: hotWeeks.length,
            otherWeeks: otherWeeks.length,
            diffPct: Math.round(diff * 100),
          },
        })
      }
    }
  }

  // 3. Kid share in school-break vs non-break weeks
  const breakGuestCount   = { total: 0, kids: 0 }
  const nonBreakGuestCount = { total: 0, kids: 0 }

  guests.forEach(g => {
    if (!g.check_in_date) return
    const br = schoolBreakFor(g.check_in_date)
    const isKid = g.age !== null && g.age > 0 && g.age < 13
    const bucket = br ? breakGuestCount : nonBreakGuestCount
    bucket.total++
    if (isKid) bucket.kids++
  })

  if (breakGuestCount.total >= 100 && nonBreakGuestCount.total >= 100) {
    const breakKidShare    = breakGuestCount.kids    / breakGuestCount.total
    const nonBreakKidShare = nonBreakGuestCount.kids / nonBreakGuestCount.total
    if (nonBreakKidShare > 0) {
      const ratio = breakKidShare / nonBreakKidShare
      if (ratio >= 1.3) {
        findings.push({
          id: 'weather.school-break-kids',
          kind: 'background',
          category: 'weather',
          title: 'School-break weeks bring significantly more kids',
          detail: `${Math.round(breakKidShare * 100)}% kids during school breaks vs ${Math.round(nonBreakKidShare * 100)}% at other times`,
          n: breakGuestCount.total + nonBreakGuestCount.total,
          nLabel: `${breakGuestCount.total + nonBreakGuestCount.total} guests`,
          strength: ratio >= 1.6 ? 'strong' : 'moderate',
          facts: {
            breakKidPct: Math.round(breakKidShare * 100),
            nonBreakKidPct: Math.round(nonBreakKidShare * 100),
            ratio: Math.round(ratio * 100) / 100,
            breakTotal: breakGuestCount.total,
            nonBreakTotal: nonBreakGuestCount.total,
          },
        })
      }
    }
  }

  return { findings, status }
}
