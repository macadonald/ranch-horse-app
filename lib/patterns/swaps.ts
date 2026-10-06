import { DetectorResult, PatternGuest } from './types'
import { LEVEL_LABELS } from '@/lib/horses'

export function detectSwaps(guests: PatternGuest[]): DetectorResult {
  const findings: DetectorResult['findings'] = []

  const gwa = guests.filter(g => (g.horse_assignments || []).length > 0)

  const status: DetectorResult['status'] = {
    category: 'swaps',
    checked: `${gwa.length} guests with assignments`,
  }

  const topOf = (arr: string[]): string | null => {
    if (!arr.length) return null
    const c: Record<string, number> = {}
    arr.forEach(r => { c[r] = (c[r] || 0) + 1 })
    return Object.entries(c).sort(([, a], [, b]) => b - a)[0][0]
  }

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

  if (flagged.length > 0) {
    const [topHorse, topData] = flagged[0]
    const count = topData.guestIds.size
    const topReason = topOf(topData.swapReasons) ?? topOf(topData.reasons)
    const detail = topReason
      ? `${count} different guests · top reason: "${topReason}"`
      : `${count} different guests flagged this horse`

    const totalFlagged = flagged.length
    findings.push({
      id: 'swaps.horse-flags',
      kind: 'action',
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

    const levelLabel = LEVEL_LABELS[lvl] || lvl

    findings.push({
      id: `swaps.level-reason-${lvl}`,
      kind: 'action',
      category: 'swaps',
      title: `"${topReason}" is the main swap reason for ${levelLabel} riders`,
      detail: `${pct}% of ${reasons.length} swaps for this level`,
      n: reasons.length,
      nLabel: `${reasons.length} swaps for ${levelLabel}`,
      strength: pct >= 70 ? 'strong' : 'moderate',
      facts: { level: lvl, topReason, pct, total: reasons.length },
    })
  })

  return { findings, status }
}
