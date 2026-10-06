import { DetectorResult, PatternGuest } from './types'

function toYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return toYMD(d)
}

function getSundayOf(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() - d.getDay())
  return toYMD(d)
}

function stayEnd(g: PatternGuest, today: string): string {
  return g.check_out_date || g.checked_out_at?.slice(0, 10) || today
}

function guestsInWindow(all: PatternGuest[], winStart: string, winEnd: string, today: string): PatternGuest[] {
  return all.filter(g => {
    if (!g.check_in_date) return false
    const gs = g.check_in_date
    const ge = stayEnd(g, today)
    return gs <= winEnd && ge >= winStart
  })
}

export function detectGuestShifts(guests: PatternGuest[], today: string): DetectorResult {
  const findings: DetectorResult['findings'] = []

  const todaySun  = getSundayOf(today)
  const recentEnd = addDays(todaySun, -1)
  const recentStart = addDays(todaySun, -56)
  const priorEnd  = addDays(recentStart, -1)
  const priorStart = addDays(todaySun, -112)

  const recentG = guestsInWindow(guests, recentStart, recentEnd, today)
  const priorG  = guestsInWindow(guests, priorStart,  priorEnd,  today)

  const status: DetectorResult['status'] = {
    category: 'guests',
    checked: recentG.length + priorG.length >= 40
      ? `${recentG.length + priorG.length} guests across 16 weeks`
      : `${guests.length} guests total`,
  }

  if (recentG.length < 20 || priorG.length < 20) return { findings, status }

  const recentAvgPerWeek = recentG.length / 8
  const priorAvgPerWeek  = priorG.length  / 8

  function heavyPct(grp: PatternGuest[]) {
    const withWt = grp.filter(g => g.weight && g.weight > 0)
    if (!withWt.length) return null
    return withWt.filter(g => g.weight! >= 200).length / withWt.length
  }

  function kidsPct(grp: PatternGuest[]) {
    const withAge = grp.filter(g => g.age && g.age > 0)
    if (!withAge.length) return null
    return withAge.filter(g => g.age! < 13).length / withAge.length
  }

  function nafRate(grp: PatternGuest[]) {
    let total = 0, incompat = 0
    grp.forEach(g => {
      (g.horse_assignments || []).forEach(a => {
        total++
        if (a.incompatible) incompat++
      })
    })
    return total >= 5 ? incompat / total : null
  }

  interface Metric { label: string; recent: number | null; prior: number | null; id: string }
  const metrics: Metric[] = [
    { id: 'guestCount', label: 'avg guests/week', recent: recentAvgPerWeek, prior: priorAvgPerWeek },
    { id: 'heavy200',   label: '% riders 200+ lb', recent: heavyPct(recentG), prior: heavyPct(priorG) },
    { id: 'kids13',     label: '% kids under 13',  recent: kidsPct(recentG),  prior: kidsPct(priorG)  },
    { id: 'nafRate',    label: 'not-a-fit rate',    recent: nafRate(recentG),  prior: nafRate(priorG)  },
  ]

  metrics.forEach(m => {
    if (m.recent === null || m.prior === null || m.prior === 0) return
    const relChange = (m.recent - m.prior) / m.prior
    if (Math.abs(relChange) < 0.3) return

    const dir = relChange > 0 ? 'up' : 'down'
    const pct = Math.round(Math.abs(relChange) * 100)

    let title = '', detail = ''
    if (m.id === 'guestCount') {
      title = relChange > 0
        ? 'Guest volume is up over the last 8 weeks'
        : 'Guest volume is down over the last 8 weeks'
      detail = `${m.recent.toFixed(1)} guests/week recently vs ${m.prior.toFixed(1)} prior 8 weeks (${pct}% ${dir})`
    } else if (m.id === 'heavy200') {
      title = relChange > 0
        ? 'Share of 200+ lb riders has increased recently'
        : 'Share of 200+ lb riders has decreased recently'
      detail = `${Math.round(m.recent * 100)}% recently vs ${Math.round(m.prior * 100)}% prior 8 weeks (${pct}% ${dir})`
    } else if (m.id === 'kids13') {
      title = relChange > 0
        ? 'More kids (under 13) in recent weeks'
        : 'Fewer kids (under 13) in recent weeks'
      detail = `${Math.round(m.recent * 100)}% recently vs ${Math.round(m.prior * 100)}% prior 8 weeks (${pct}% ${dir})`
    } else {
      title = relChange > 0
        ? 'Not-a-fit rate has risen over the last 8 weeks'
        : 'Not-a-fit rate has dropped over the last 8 weeks'
      detail = `${Math.round(m.recent * 100)}% recently vs ${Math.round(m.prior * 100)}% prior 8 weeks (${pct}% ${dir})`
    }

    findings.push({
      id: `guests.shift-${m.id}`,
      kind: 'background',
      category: 'guests',
      title,
      detail,
      n: recentG.length + priorG.length,
      nLabel: `${recentG.length + priorG.length} guests across 16 weeks`,
      strength: Math.abs(relChange) >= 0.5 ? 'strong' : 'moderate',
      facts: {
        recentVal: Math.round((m.recent ?? 0) * 1000) / 1000,
        priorVal:  Math.round((m.prior  ?? 0) * 1000) / 1000,
        relChangePct: Math.round(relChange * 100),
        recentN: recentG.length,
        priorN:  priorG.length,
      },
    })
  })

  return { findings, status }
}
