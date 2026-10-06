import { DetectorResult, PatternGuest } from './types'

const DOW    = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function detectCalendar(guests: PatternGuest[]): DetectorResult {
  const findings: DetectorResult['findings'] = []
  const withCI = guests.filter(g => g.check_in_date)
  const withCO = guests.filter(g => g.check_out_date)

  const status: DetectorResult['status'] = {
    category: 'calendar',
    checked: `${withCI.length.toLocaleString()} check-ins`,
  }

  // 1. Busiest check-in DOW (min 200)
  if (withCI.length >= 200) {
    const counts: Record<number, number> = {}
    withCI.forEach(g => {
      const dow = new Date(g.check_in_date! + 'T12:00:00').getDay()
      counts[dow] = (counts[dow] || 0) + 1
    })
    const avg = withCI.length / 7
    const [topDow, topN] = Object.entries(counts).reduce((a, b) => +b[1] > +a[1] ? b : a)
    const ratio = +topN / avg
    if (ratio >= 1.25) {
      const pct = Math.round((+topN / withCI.length) * 100)
      findings.push({
        id: 'calendar.checkin-dow',
        kind: 'background',
        category: 'calendar',
        title: `${DOW[+topDow]}s are your busiest check-in day`,
        detail: `${pct}% of check-ins vs ${Math.round(100 / 7)}% if spread evenly`,
        n: withCI.length,
        nLabel: `${withCI.length.toLocaleString()} check-ins`,
        strength: ratio >= 1.5 ? 'strong' : 'moderate',
        facts: { dow: +topDow, count: +topN, pct, ratio: Math.round(ratio * 100) / 100 },
      })
    }
  }

  // 2. Busiest checkout DOW (min 200)
  if (withCO.length >= 200) {
    const counts: Record<number, number> = {}
    withCO.forEach(g => {
      const dow = new Date(g.check_out_date! + 'T12:00:00').getDay()
      counts[dow] = (counts[dow] || 0) + 1
    })
    const avg = withCO.length / 7
    const [topDow, topN] = Object.entries(counts).reduce((a, b) => +b[1] > +a[1] ? b : a)
    const ratio = +topN / avg
    if (ratio >= 1.25) {
      const pct = Math.round((+topN / withCO.length) * 100)
      findings.push({
        id: 'calendar.checkout-dow',
        kind: 'background',
        category: 'calendar',
        title: `${DOW[+topDow]}s are your busiest checkout day`,
        detail: `${pct}% of checkouts vs ${Math.round(100 / 7)}% if spread evenly`,
        n: withCO.length,
        nLabel: `${withCO.length.toLocaleString()} checkouts`,
        strength: ratio >= 1.5 ? 'strong' : 'moderate',
        facts: { dow: +topDow, count: +topN, pct, ratio: Math.round(ratio * 100) / 100 },
      })
    }
  }

  // 3. Busiest month by arrivals (min 4 months)
  const monthCounts: Record<string, number> = {}
  withCI.forEach(g => {
    const mm = g.check_in_date!.slice(0, 7)
    monthCounts[mm] = (monthCounts[mm] || 0) + 1
  })
  const monthKeys = Object.keys(monthCounts)
  if (monthKeys.length >= 4) {
    const avg = withCI.length / monthKeys.length
    const topMM = monthKeys.reduce((a, b) => monthCounts[b] > monthCounts[a] ? b : a)
    const topN  = monthCounts[topMM]
    const ratio = topN / avg
    if (ratio >= 1.25) {
      const [, m] = topMM.split('-')
      const label = MONTHS[+m - 1]
      findings.push({
        id: 'calendar.busiest-month',
        kind: 'background',
        category: 'calendar',
        title: `${label} is your busiest arrival month`,
        detail: `${topN} check-ins vs ${Math.round(avg)} avg across ${monthKeys.length} months`,
        n: withCI.length,
        nLabel: `${monthKeys.length} months of data`,
        strength: ratio >= 1.5 ? 'strong' : 'moderate',
        facts: { month: topMM, count: topN, avg: Math.round(avg), ratio: Math.round(ratio * 100) / 100 },
      })
    }
  }

  // 4. Week-of-month per-day swing (checkouts)
  if (withCO.length >= 40) {
    const womCounts: Record<number, number> = {}
    withCO.forEach(g => {
      const day = new Date(g.check_out_date! + 'T12:00:00').getDate()
      const wom = Math.ceil(day / 7)
      womCounts[wom] = (womCounts[wom] || 0) + 1
    })

    const coDates = withCO.map(g => g.check_out_date!).sort()
    const womCalDays: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
    const cur = new Date(coDates[0].slice(0, 7) + '-01T12:00:00')
    const endM = new Date(coDates[coDates.length - 1].slice(0, 7) + '-01T12:00:00')
    while (cur <= endM) {
      const daysInMonth = new Date(cur.getFullYear(), cur.getMonth() + 1, 0).getDate()
      for (let d = 1; d <= daysInMonth; d++) {
        const wom = Math.ceil(d / 7)
        womCalDays[wom] = (womCalDays[wom] || 0) + 1
      }
      cur.setMonth(cur.getMonth() + 1)
    }

    const perDay = [1, 2, 3, 4, 5]
      .filter(w => womCalDays[w] > 0)
      .map(w => ({ wom: w, perDay: (womCounts[w] || 0) / womCalDays[w] }))

    if (perDay.length >= 3) {
      const avgPD = perDay.reduce((s, w) => s + w.perDay, 0) / perDay.length
      const top   = perDay.reduce((a, b) => b.perDay > a.perDay ? b : a)
      if (avgPD > 0 && top.perDay >= 1.25 * avgPD) {
        findings.push({
          id: 'calendar.wom-checkout',
          kind: 'background',
          category: 'calendar',
          title: `Week ${top.wom} of the month has the most checkouts per day`,
          detail: `${top.perDay.toFixed(2)} checkouts/calendar-day vs ${avgPD.toFixed(2)} average`,
          n: withCO.length,
          nLabel: `${withCO.length.toLocaleString()} checkouts`,
          strength: top.perDay >= 1.5 * avgPD ? 'strong' : 'moderate',
          facts: { wom: top.wom, perDay: Math.round(top.perDay * 100) / 100, avgPerDay: Math.round(avgPD * 100) / 100 },
        })
      }
    }
  }

  return { findings, status }
}
