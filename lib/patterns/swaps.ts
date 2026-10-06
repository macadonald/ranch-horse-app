import { Finding, PatternGuest } from './types'

export function detectSwaps(guests: PatternGuest[]): Finding[] {
  const findings: Finding[] = []

  const gwa = guests.filter(g => (g.horse_assignments || []).length > 0)

  // 1. Horses with not-a-fit from 3+ distinct guests
  const dwByHorse: Record<string, { guestIds: Set<string>; reasons: string[]; swapReasons: string[] }> = {}
  gwa.forEach((g, idx) => {
    const gid = g.id ?? String(idx)
    ;(g.horse_assignments || []).filter(a => a.incompatible).forEach(a => {
      if (!dwByHorse[a.horse_name]) dwByHorse[a.horse_name] = { guestIds: new Set(), reasons: [], swapReasons: [] }
      const entry = dwByHorse[a.horse_name]
      entry.guestIds.add(gid)
      const sr = (a.swap_reason || a.swap_category || '').trim()
      const r  = (a.reason || '').trim()
      if (sr) entry.swapReasons.push(sr)
      else if (r) entry.reasons.push(r)
    })
  })

  const flagged = Object.entries(dwByHorse)
    .filter(([, v]) => v.guestIds.size >= 3)
    .sort(([, a], [, b]) => b.guestIds.size - a.guestIds.size)

  const topOf = (arr: string[]): string | null => {
    if (!arr.length) return null
    const c: Record<string, number> = {}
    arr.forEach(r => { c[r] = (c[r] || 0) + 1 })
    return Object.entries(c).sort(([, a], [, b]) => b - a)[0][0]
  }

  if (flagged.length > 0) {
    // Surface the top horse as a specific finding; report count of flagged horses
    const [topHorse, topData] = flagged[0]
    const count = topData.guestIds.size

    const topReason = topOf(topData.swapReasons) ?? topOf(topData.reasons)
    const detail = topReason
      ? `${count} different guests · top reason: "${topReason}"`
      : `${count} different guests flagged this horse`

    const totalFlagged = flagged.length
    findings.push({
      id: 'swaps.horse-flags',
      category: 'swaps',
      title: totalFlagged === 1
        ? `${topHorse} has not-a-fit flags from ${count}+ different guests`
        : `${totalFlagged} horses have not-a-fit flags from 3+ different guests`,
      detail,
      n: flagged.reduce((s, [, v]) => s + v.guestIds.size, 0),
      nLabel: `${flagged.reduce((s, [, v]) => s + v.guestIds.size, 0)} not-a-fit assignments`,
      strength: count >= 6 ? 'strong' : 'moderate',
      facts: {
        topHorse,
        topCount: count,
        totalFlaggedHorses: totalFlagged,
        topReason: topReason ?? '',
      },
    })
  }

  // 2. Swap-reason breakdown by riding level
  // For each level, among incompatible assignments, what reason dominates?
  const levelSwaps: Record<string, string[]> = {}
  gwa.forEach(g => {
    const lvl = g.riding_level
    if (!lvl) return
    ;(g.horse_assignments || []).filter(a => a.incompatible).forEach(a => {
      const reason = (a.swap_reason || a.swap_category || a.reason || '').trim()
      if (!reason) return
      if (!levelSwaps[lvl]) levelSwaps[lvl] = []
      levelSwaps[lvl].push(reason)
    })
  })

  Object.entries(levelSwaps).forEach(([lvl, reasons]) => {
    if (reasons.length < 8) return
    const c: Record<string, number> = {}
    reasons.forEach(r => { c[r] = (c[r] || 0) + 1 })
    const [[topReason, topCount]] = Object.entries(c).sort(([, a], [, b]) => b - a)
    const pct = Math.round((topCount / reasons.length) * 100)
    if (pct < 50) return

    findings.push({
      id: `swaps.level-reason-${lvl}`,
      category: 'swaps',
      title: `"${topReason}" is the main swap reason for ${lvl} riders`,
      detail: `${pct}% of ${reasons.length} swaps for this level`,
      n: reasons.length,
      nLabel: `${reasons.length} swaps for ${lvl} level`,
      strength: pct >= 70 ? 'strong' : 'moderate',
      facts: { level: lvl, topReason, pct, total: reasons.length },
    })
  })

  return findings
}
