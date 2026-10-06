import { DetectorResult, PatternGuest, PatternHorse } from './types'
import { LEVEL_ORDER, LEVEL_LABELS } from '@/lib/horses'
import { horseWeightCeiling, isHorseBlockedToday } from '@/lib/horseFit'
import { getWeightBand } from '@/lib/weightBands'

const MS = 24 * 60 * 60 * 1000

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function detectHorses(guests: PatternGuest[], horses: PatternHorse[], today: string): DetectorResult {
  const findings: DetectorResult['findings'] = []

  const activeHorses  = horses.filter(h => h.is_active)
  const unblockedHorses = activeHorses.filter(h => !isHorseBlockedToday(h.flags, today))

  const status: DetectorResult['status'] = {
    category: 'horses',
    checked: `${activeHorses.length} active horses`,
  }

  // Build per-horse assignment records from all guests
  type AssignRec = {
    level: string | null
    weight: number | null
    checkIn: string
    stayEnd: string
    incompatible: boolean
    swapReason: string | null
  }
  const byHorse: Record<string, AssignRec[]> = {}
  guests.forEach(g => {
    if (!g.check_in_date) return
    const se = g.check_out_date || g.checked_out_at?.slice(0, 10) || today
    ;(g.horse_assignments || []).forEach(a => {
      if (!byHorse[a.horse_name]) byHorse[a.horse_name] = []
      byHorse[a.horse_name].push({
        level: g.riding_level,
        weight: g.weight,
        checkIn: g.check_in_date!,
        stayEnd: se,
        incompatible: a.incompatible,
        swapReason: a.swap_reason || a.swap_category || null,
      })
    })
  })

  // ── 1. Rider-type mismatch (action) ───────────────────────────────────────
  // Horse with >= 4 assignments to one riding level or weight band, >= 40% not-a-fit
  type Mismatch = {
    name: string
    bucket: string
    total: number
    incompat: number
    topReason: string | null
  }
  const mismatches: Mismatch[] = []

  activeHorses.forEach(h => {
    const assigns = byHorse[h.name] || []

    // By riding level
    const byLevel: Record<string, AssignRec[]> = {}
    assigns.forEach(a => {
      const k = a.level || '_'
      if (!byLevel[k]) byLevel[k] = []
      byLevel[k].push(a)
    })
    Object.entries(byLevel).forEach(([lvl, recs]) => {
      if (lvl === '_' || recs.length < 4) return
      const incompat = recs.filter(r => r.incompatible).length
      if (incompat / recs.length < 0.4) return
      const reasons = recs.filter(r => r.swapReason).map(r => r.swapReason!)
      const c: Record<string, number> = {}
      reasons.forEach(r => { c[r] = (c[r] || 0) + 1 })
      const topReason = reasons.length > 0 ? Object.entries(c).sort(([, a], [, b]) => b - a)[0][0] : null
      mismatches.push({ name: h.name, bucket: LEVEL_LABELS[lvl] || lvl, total: recs.length, incompat, topReason })
    })

    // By weight band
    const byBand: Record<string, AssignRec[]> = {}
    assigns.forEach(a => {
      const band = getWeightBand(a.weight)
      if (!band) return
      if (!byBand[band.label]) byBand[band.label] = []
      byBand[band.label].push(a)
    })
    Object.entries(byBand).forEach(([bandLabel, recs]) => {
      if (recs.length < 4) return
      const incompat = recs.filter(r => r.incompatible).length
      if (incompat / recs.length < 0.4) return
      const reasons = recs.filter(r => r.swapReason).map(r => r.swapReason!)
      const c: Record<string, number> = {}
      reasons.forEach(r => { c[r] = (c[r] || 0) + 1 })
      const topReason = reasons.length > 0 ? Object.entries(c).sort(([, a], [, b]) => b - a)[0][0] : null
      mismatches.push({ name: h.name, bucket: `${bandLabel} lb`, total: recs.length, incompat, topReason })
    })
  })

  // Deduplicate: keep worst mismatch per horse
  const worstByHorse: Record<string, Mismatch> = {}
  mismatches.forEach(m => {
    const rate = m.incompat / m.total
    const existing = worstByHorse[m.name]
    if (!existing || rate > existing.incompat / existing.total) worstByHorse[m.name] = m
  })
  const allMismatches = Object.values(worstByHorse).sort((a, b) => (b.incompat / b.total) - (a.incompat / a.total))

  if (allMismatches.length > 0) {
    const top = allMismatches[0]
    const pct = Math.round(top.incompat / top.total * 100)
    findings.push({
      id: 'horses.rider-mismatch',
      kind: 'action',
      category: 'horses',
      title: allMismatches.length === 1
        ? `${top.name}: ${top.incompat} of ${top.total} ${top.bucket} riders not-a-fit${top.topReason ? ` (${top.topReason})` : ''}`
        : `${allMismatches.length} horses have rider-type mismatches`,
      detail: allMismatches.length === 1
        ? `${pct}% incompatible for ${top.bucket}`
        : allMismatches.slice(0, 3).map(m => `${m.name}: ${m.incompat}/${m.total} ${m.bucket}`).join(' · '),
      n: allMismatches.reduce((s, m) => s + m.total, 0),
      nLabel: `${allMismatches.reduce((s, m) => s + m.total, 0)} assignments`,
      strength: pct >= 60 ? 'strong' : 'moderate',
      facts: { topHorse: top.name, topPct: pct, count: allMismatches.length },
    })
  }

  // ── 2. Workload imbalance (action) ────────────────────────────────────────
  // Last 8 weeks, top 3 horses carry >= 2× their fair share; min 30 active horses
  if (activeHorses.length >= 30) {
    const eightWeeksAgo = addDays(today, -56)
    const assignCount: Record<string, number> = {}

    guests.forEach(g => {
      if (!g.check_in_date || g.check_in_date < eightWeeksAgo) return
      ;(g.horse_assignments || []).filter(a => !a.incompatible).forEach(a => {
        if (!activeHorses.find(h => h.name === a.horse_name)) return
        assignCount[a.horse_name] = (assignCount[a.horse_name] || 0) + 1
      })
    })

    const totalAssigns = Object.values(assignCount).reduce((s, v) => s + v, 0)
    if (totalAssigns > 0) {
      const fairSharePer = totalAssigns / activeHorses.length
      const sorted = Object.entries(assignCount).sort(([, a], [, b]) => b - a)
      const top3 = sorted.slice(0, 3)
      const top3Total = top3.reduce((s, [, v]) => s + v, 0)

      if (top3Total >= 2 * fairSharePer * 3) {
        const top3Names = top3.map(([n]) => n).join(', ')
        const top3Pct = Math.round(top3Total / totalAssigns * 100)
        const fairPct = Math.round((fairSharePer * 3 / totalAssigns) * 100)
        findings.push({
          id: 'horses.workload-imbalance',
          kind: 'action',
          category: 'horses',
          title: 'Top 3 horses are carrying a disproportionate share of rides',
          detail: `${top3Names} — ${top3Pct}% of all assignments in the last 8 weeks (fair share: ${fairPct}%)`,
          n: totalAssigns,
          nLabel: `${totalAssigns} assignments (last 8 weeks)`,
          strength: top3Total >= 2.5 * fairSharePer * 3 ? 'strong' : 'moderate',
          facts: { top3: top3Names, top3Pct, fairSharePct: fairPct },
        })
      }
    }
  }

  // ── 3. Idle while available (action) ─────────────────────────────────────
  // Active, unflagged horses with no assignment in 14+ days while busiest 10% avg >= 5/week
  const fourteenDaysAgo = addDays(today, -14)
  const eightWeeksAgo2  = addDays(today, -56)

  const lastAssign: Record<string, string> = {}
  const recentAssignCount: Record<string, number> = {}

  guests.forEach(g => {
    if (!g.check_in_date) return
    ;(g.horse_assignments || []).filter(a => !a.incompatible).forEach(a => {
      const existing = lastAssign[a.horse_name]
      if (!existing || g.check_in_date! > existing) lastAssign[a.horse_name] = g.check_in_date!
      if (g.check_in_date! >= eightWeeksAgo2) {
        recentAssignCount[a.horse_name] = (recentAssignCount[a.horse_name] || 0) + 1
      }
    })
  })

  const idleHorses = unblockedHorses
    .filter(h => { const last = lastAssign[h.name]; return !last || last < fourteenDaysAgo })
    .sort((a, b) => {
      const la = lastAssign[a.name] || '0000-00-00'
      const lb = lastAssign[b.name] || '0000-00-00'
      return la.localeCompare(lb)
    })

  if (idleHorses.length >= 3) {
    const top10pctN = Math.max(1, Math.round(activeHorses.length * 0.1))
    const top10pctCounts = activeHorses
      .map(h => recentAssignCount[h.name] || 0)
      .sort((a, b) => b - a)
      .slice(0, top10pctN)
    const avgTop10pct = top10pctCounts.reduce((s, v) => s + v, 0) / top10pctN
    const avgPerWeek  = avgTop10pct / 8

    if (avgPerWeek >= 5) {
      const top5 = idleHorses.slice(0, 5)
      const nameList = top5.map(h => {
        const last = lastAssign[h.name]
        const days = last
          ? Math.round((new Date(today + 'T12:00:00').getTime() - new Date(last + 'T12:00:00').getTime()) / MS)
          : null
        return days ? `${h.name} (${days}d)` : h.name
      }).join(', ')
      findings.push({
        id: 'horses.idle',
        kind: 'action',
        category: 'horses',
        title: `${idleHorses.length} active horses haven't been assigned in 14+ days`,
        detail: `${nameList}${idleHorses.length > 5 ? ` +${idleHorses.length - 5} more` : ''} · while busiest 10% averaged ${avgPerWeek.toFixed(1)} assignments/week`,
        n: idleHorses.length,
        nLabel: `${idleHorses.length} idle horses`,
        strength: idleHorses.length >= 6 ? 'strong' : 'moderate',
        facts: { idleCount: idleHorses.length, avgBusiestPerWeek: Math.round(avgPerWeek * 10) / 10 },
      })
    }
  }

  // ── 4. Near weight limit (action) ─────────────────────────────────────────
  // >= 4 times in last 4 weeks carrying a rider within 10 lb of horseWeightCeiling
  const fourWeeksAgo = addDays(today, -28)

  // Historical max weight per horse (all non-incompatible assignments)
  const histMaxWeight: Record<string, number> = {}
  guests.forEach(g => {
    if (!g.weight || g.weight <= 0) return
    ;(g.horse_assignments || []).filter(a => !a.incompatible).forEach(a => {
      if (g.weight! > (histMaxWeight[a.horse_name] || 0)) histMaxWeight[a.horse_name] = g.weight!
    })
  })

  const nearLimit: Array<{ name: string; count: number; ceiling: number }> = []
  activeHorses.forEach(h => {
    const ceiling = horseWeightCeiling(h.weight, histMaxWeight[h.name] || 0)
    if (!ceiling) return
    let count = 0
    guests.forEach(g => {
      if (!g.check_in_date || g.check_in_date < fourWeeksAgo) return
      if (!g.weight || g.weight < ceiling - 10) return
      ;(g.horse_assignments || []).filter(a => !a.incompatible && a.horse_name === h.name).forEach(() => {
        count++
      })
    })
    if (count >= 4) nearLimit.push({ name: h.name, count, ceiling })
  })
  nearLimit.sort((a, b) => b.count - a.count)

  if (nearLimit.length > 0) {
    const top3 = nearLimit.slice(0, 3)
    const nameList = top3.map(h => `${h.name} (${h.count}× ≥${h.ceiling - 10} lb)`).join(', ')
    findings.push({
      id: 'horses.near-weight-limit',
      kind: 'action',
      category: 'horses',
      title: nearLimit.length === 1
        ? `${nearLimit[0].name} repeatedly carried riders near its weight limit`
        : `${nearLimit.length} horses repeatedly carried riders near their weight limit`,
      detail: `Last 4 weeks: ${nameList}${nearLimit.length > 3 ? ` +${nearLimit.length - 3} more` : ''}`,
      n: nearLimit.reduce((s, h) => s + h.count, 0),
      nLabel: `${nearLimit.reduce((s, h) => s + h.count, 0)} near-limit assignments`,
      strength: nearLimit.length >= 3 || nearLimit[0].count >= 8 ? 'strong' : 'moderate',
      facts: { count: nearLimit.length, topHorse: nearLimit[0].name, topCount: nearLimit[0].count },
    })
  }

  // ── 5. Squeeze right now (action) ─────────────────────────────────────────
  // Level buckets where guests currently present > available suitable horses
  const hereNow = guests.filter(g => {
    if (!g.check_in_date || g.check_in_date > today) return false
    const se = g.check_out_date || g.checked_out_at?.slice(0, 10) || today
    return se >= today
  })

  if (hereNow.length > 0) {
    const guestsByLevel: Record<string, number> = {}
    hereNow.forEach(g => {
      if (g.riding_level) guestsByLevel[g.riding_level] = (guestsByLevel[g.riding_level] || 0) + 1
    })

    // Horses available per level: base level ±1 in LEVEL_ORDER
    const horsesByLevel: Record<string, number> = {}
    unblockedHorses.forEach(h => {
      const baseIdx = LEVEL_ORDER.indexOf(h.level)
      if (baseIdx < 0) return
      const lo = Math.max(0, baseIdx - 1)
      const hi = Math.min(LEVEL_ORDER.length - 1, baseIdx + 1)
      for (let i = lo; i <= hi; i++) {
        const lvl = LEVEL_ORDER[i]
        horsesByLevel[lvl] = (horsesByLevel[lvl] || 0) + 1
      }
    })

    const squeezed = Object.entries(guestsByLevel)
      .filter(([lvl, gc]) => gc >= 2 && (horsesByLevel[lvl] || 0) < gc)
      .sort(([, a], [, b]) => b - a)

    if (squeezed.length > 0) {
      const [topLvl, topGc] = squeezed[0]
      findings.push({
        id: 'horses.squeeze',
        kind: 'action',
        category: 'horses',
        title: squeezed.length === 1
          ? `${LEVEL_LABELS[topLvl] || topLvl} guests currently outnumber suitable horses`
          : `${squeezed.length} level groups currently have more guests than horses`,
        detail: squeezed.slice(0, 3)
          .map(([lvl, gc]) => `${LEVEL_LABELS[lvl] || lvl}: ${gc} guests, ${horsesByLevel[lvl] || 0} horses`)
          .join(' · '),
        n: squeezed.reduce((s, [, v]) => s + v, 0),
        nLabel: `${hereNow.length} guests here now`,
        strength: 'moderate',
        facts: {
          squeezedBuckets: squeezed.length,
          topLevel: topLvl,
          topGuests: topGc,
          topHorses: horsesByLevel[topLvl] || 0,
        },
      })
    }
  }

  return { findings, status }
}
