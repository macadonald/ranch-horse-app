import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { DbHorse, LEVEL_ORDER } from '@/lib/horses'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

type GuestInput = {
  id: string; name: string; room_number: string
  check_in_date: string; check_out_date: string
  age: number | null; weight: number | null; height: string
  riding_level: string; notes: string; horse_request: string; gender: string
  checked_out?: boolean; repeat_guest?: boolean
  horse_assignments?: { id: string; horse_name: string; assignment_type: string; status: string; incompatible: boolean }[]
}

type PastRideDetail = { date: string; loves: boolean; doesntWork: boolean }

type DraftRow = {
  guest: GuestInput
  suggestedHorse: string | null
  isDouble: boolean
  needsReview: boolean
  flagged: boolean
  noHorseReason?: 'triple_cap' | 'no_match'
}

type HorseStatEntry = {
  historicalLevels: string[]; historicalMaxWeight: number; totalAssignments: number
  historicalAvgWeight: number | null; historicalAvgAge: number | null; hasKidHistory: boolean
}

const LEARNING_CUTOFF = '2026-05-11'

export async function POST(req: NextRequest) {
  const t0 = Date.now()
  try {
    const body = await req.json()
    const { guests, horses, today } = body as { guests: GuestInput[]; horses: DbHorse[]; today: string }

    if (!Array.isArray(guests) || !Array.isArray(horses) || !today) {
      return NextResponse.json({ error: 'Missing guests, horses, or today' }, { status: 400 })
    }
    console.log(`[assign-all] starting: ${guests.length} guests, ${horses.length} horses`)

    // ── Parallel Supabase fetches ──
    const [assignRes, histRes, statsRes] = await Promise.all([
      // Current active assignments only — guests physically on property right now.
      // Must filter on guest dates so historical assignments never inflate the rider count.
      supabase.from('horse_assignments')
        .select('horse_name, guests!inner(check_out_date)')
        .eq('status', 'active')
        .eq('incompatible', false)
        .eq('guests.checked_out', false)
        .lte('guests.check_in_date', today)
        .gte('guests.check_out_date', today),
      // Historical rides since cutoff — for doesntWork / loves past-ride flags
      supabase.from('guests')
        .select('name, check_in_date, horse_assignments(horse_name, incompatible)')
        .gte('check_in_date', LEARNING_CUTOFF),
      // Per-horse stats for level range, weight ceiling, age routing, kid eligibility
      supabase.from('horse_assignments')
        .select('horse_name, guests!inner(weight, riding_level, checked_out, age)')
        .eq('incompatible', false)
        .order('assigned_at', { ascending: false })
        .limit(2000),
    ])

    if (assignRes.error) console.error('[assign-all] assignments fetch error:', assignRes.error)
    if (histRes.error) console.error('[assign-all] history fetch error:', histRes.error)
    if (statsRes.error) console.error('[assign-all] stats fetch error:', statsRes.error)

    console.log(`[assign-all] fetched in ${Date.now() - t0}ms`)

    // ── Past ride map (guest_name_lower → horse_name → PastRideDetail) ──
    const pastRideMap: Record<string, Record<string, PastRideDetail>> = {}
    for (const g of histRes.data || []) {
      const key = (g.name as string).toLowerCase()
      for (const ha of (g.horse_assignments as any[]) || []) {
        if (!pastRideMap[key]) pastRideMap[key] = {}
        const existing = pastRideMap[key][ha.horse_name]
        pastRideMap[key][ha.horse_name] = {
          date: g.check_in_date as string,
          loves: existing?.loves || false,
          doesntWork: (ha.incompatible || false) || (existing?.doesntWork || false),
        }
      }
    }

    // ── Per-horse stats (single pass over assignment rows) ──
    const rawStats: Record<string, {
      levels: Set<string>; maxWeight: number; count: number
      weightSum: number; weightCount: number; ageSum: number; ageCount: number; kidCount: number
    }> = {}
    for (const row of statsRes.data || []) {
      const g = Array.isArray(row.guests) ? row.guests[0] : row.guests
      if (!g) continue
      const name = row.horse_name as string
      if (!rawStats[name]) rawStats[name] = { levels: new Set(), maxWeight: 0, count: 0, weightSum: 0, weightCount: 0, ageSum: 0, ageCount: 0, kidCount: 0 }
      if (g.riding_level) rawStats[name].levels.add(g.riding_level as string)
      if (g.weight) rawStats[name].maxWeight = Math.max(rawStats[name].maxWeight, g.weight as number)
      rawStats[name].count++
      if (g.checked_out && g.weight) { rawStats[name].weightSum += g.weight as number; rawStats[name].weightCount++ }
      if (g.age != null) {
        rawStats[name].ageSum += g.age as number; rawStats[name].ageCount++
        if ((g.age as number) < 13) rawStats[name].kidCount++
      }
    }
    const horseStats: Record<string, HorseStatEntry> = {}
    for (const [name, e] of Object.entries(rawStats)) {
      horseStats[name] = {
        historicalLevels: Array.from(e.levels),
        historicalMaxWeight: e.maxWeight,
        totalAssignments: e.count,
        historicalAvgWeight: e.weightCount >= 5 ? Math.round(e.weightSum / e.weightCount) : null,
        historicalAvgAge: e.ageCount >= 5 ? Math.round(e.ageSum / e.ageCount) : null,
        hasKidHistory: e.kidCount > 0,
      }
    }

    // ── DB assignment map (horse_name → riders checking out) ──
    const dbAssignedMap: Record<string, { checkOut: string }[]> = {}
    for (const a of assignRes.data || []) {
      const g = Array.isArray(a.guests) ? a.guests[0] : a.guests
      if (!g) continue
      if (!dbAssignedMap[a.horse_name]) dbAssignedMap[a.horse_name] = []
      dbAssignedMap[a.horse_name].push({ checkOut: (g as any).check_out_date || '' })
    }

    // ── Scoring helpers ──
    const horseWeightCeiling = (listed: number | null, horseName: string): number => {
      if (listed === null) return 999
      const s = horseStats[horseName]
      return Math.min(listed + 30, Math.max(listed + 15, s?.historicalMaxWeight ?? 0))
    }

    const horseLevelRangeFn = (horseName: string, baseLevelIdx: number): { min: number; max: number } => {
      const s = horseStats[horseName]
      if (!s || s.totalAssignments < 5) return { min: Math.max(0, baseLevelIdx - 1), max: Math.min(LEVEL_ORDER.length - 1, baseLevelIdx + 1) }
      let lo = baseLevelIdx, hi = baseLevelIdx
      for (const lvl of s.historicalLevels) { const i = LEVEL_ORDER.indexOf(lvl); if (i !== -1) { if (i < lo) lo = i; if (i > hi) hi = i } }
      if (s.totalAssignments >= 20 && hi <= baseLevelIdx) return { min: Math.max(0, lo), max: baseLevelIdx }
      return { min: Math.max(0, Math.min(lo, baseLevelIdx - 1)), max: Math.min(LEVEL_ORDER.length - 1, hi) }
    }

    const fragilityShift = (age: number | null | undefined): number => {
      if (!age) return 0
      if (age < 10 || age >= 80) return 2
      if (age < 16 || age >= 70) return 1
      return 0
    }

    const effectiveGIdxFor = (statedGIdx: number, horseName: string, shift: number): number => {
      if (shift === 0) return statedGIdx
      const s = horseStats[horseName]
      if (s && s.historicalLevels.some(lvl => LEVEL_ORDER.indexOf(lvl) >= statedGIdx)) return statedGIdx
      return Math.max(0, statedGIdx - shift)
    }

    const levelDirScore = (gIdx: number, hIdx: number, age: number | undefined): number => {
      const rawDiff = gIdx - hIdx
      const isSensitive = !!(age && (age < 16 || age >= 70))
      const isAdvanced = gIdx === LEVEL_ORDER.length - 1
      if (isSensitive) {
        if (rawDiff >= 0) return rawDiff === 0 ? 0 : rawDiff <= 2 ? rawDiff * 0.5 : rawDiff
        return Math.abs(rawDiff) * 10
      }
      if (isAdvanced) {
        if (rawDiff > 3) return rawDiff * 1.5
        if (rawDiff >= 0) return rawDiff * 0.3
        return Math.abs(rawDiff) * 2
      }
      if (rawDiff >= 0) return rawDiff
      if (Math.abs(rawDiff) === 1) return 1.5
      return Math.abs(rawDiff) * 5
    }

    const ageRoutingScore = (guestAge: number | null | undefined, horseName: string): number => {
      if (!guestAge) return 0
      const s = horseStats[horseName]
      if (!s || s.totalAssignments < 5 || s.historicalAvgAge == null) return 0
      const dist = Math.abs(s.historicalAvgAge - guestAge)
      if (dist <= 10) return 0
      return dist <= 30 ? (dist - 10) / 20 : 1 + (dist - 30) * 0.03
    }

    const weightRoutingScore = (guestWeight: number, horseName: string, isDraft: boolean): number => {
      const s = horseStats[horseName]
      if (!s || s.totalAssignments < 5 || s.historicalAvgWeight == null) return 0
      const dist = s.historicalAvgWeight - guestWeight
      if (dist <= 10) return 0
      const raw = dist <= 40 ? (dist - 10) / 15 : 2 + (dist - 40) * 0.05
      return isDraft ? Math.min(raw, 1.0) : raw
    }

    // ── Eligible horses ──
    const hasBlockingFlag = (h: DbHorse) => (h.flags || []).some(f => {
      if (f.flag_type === 'day_off') return f.day_off_date === today
      return ['lame', 'injured', 'in_training', 'retired'].includes(f.flag_type)
    })
    const eligibleHorses = horses.filter(h => h.is_active && !h.is_deceased && !h.exclude_from_ai && !hasBlockingFlag(h))

    // ── Unassigned guests ──
    const unassigned = guests.filter(g => !g.horse_assignments?.some(a => a.status === 'active' && !a.incompatible))
    if (unassigned.length === 0) {
      return NextResponse.json({ draft: [], pastRideMap }, { headers: { 'Cache-Control': 'no-store' } })
    }

    // ── Planning tier: heavy → kids-only → most-constrained-first ──
    const hasStandardOption = (g: GuestInput) =>
      eligibleHorses.some(h => !h.is_draft && horseWeightCeiling(h.weight, h.name) >= (g.weight ?? 0))
    const onlyFitsKidsHorses = (g: GuestInput) =>
      eligibleHorses.some(h => horseWeightCeiling(h.weight, h.name) >= (g.weight ?? 0)) &&
      eligibleHorses.every(h => horseWeightCeiling(h.weight, h.name) < (g.weight ?? 0) || h.takes_kids)
    const eligibleCountFor = (g: GuestInput): number => {
      const gIdx = LEVEL_ORDER.indexOf(g.riding_level)
      if (gIdx === -1) return 999
      const shift = fragilityShift(g.age)
      const isKidGuest = g.age != null && g.age < 13
      return eligibleHorses.filter(h => {
        if ((g.weight ?? 0) > horseWeightCeiling(h.weight, h.name)) return false
        if (isKidGuest && !h.takes_kids && !(horseStats[h.name]?.hasKidHistory ?? false)) return false
        const hIdx = LEVEL_ORDER.indexOf(h.level)
        if (hIdx === -1) return false
        const r = horseLevelRangeFn(h.name, hIdx)
        const eff = effectiveGIdxFor(gIdx, h.name, shift)
        return eff >= r.min && eff <= r.max
      }).length
    }

    const heavyGuests = unassigned.filter(g => !hasStandardOption(g)).sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))
    const heavySet = new Set(heavyGuests.map(g => g.id))
    const kidsOnlyGuests = unassigned.filter(g => !heavySet.has(g.id) && onlyFitsKidsHorses(g))
    const kidsOnlySet = new Set(kidsOnlyGuests.map(g => g.id))
    const remainingGuests = unassigned.filter(g => !heavySet.has(g.id) && !kidsOnlySet.has(g.id)).sort((a, b) => {
      const aC = eligibleCountFor(a), bC = eligibleCountFor(b)
      if (aC !== bC) return aC - bC
      if ((b.weight ?? 0) !== (a.weight ?? 0)) return (b.weight ?? 0) - (a.weight ?? 0)
      const ai = LEVEL_ORDER.indexOf(a.riding_level), bi = LEVEL_ORDER.indexOf(b.riding_level)
      return (bi < 0 ? -1 : bi) - (ai < 0 ? -1 : ai)
    })
    const sorted = [...heavyGuests, ...kidsOnlyGuests, ...remainingGuests]

    // ── Pass 1: assign each guest a unique unshared horse ──
    const draft: DraftRow[] = []
    const usedInPass1 = new Set<string>()
    const pass2Queue: GuestInput[] = []

    for (const guest of sorted) {
      const gIdx = LEVEL_ORDER.indexOf(guest.riding_level)
      if (gIdx === -1) { pass2Queue.push(guest); continue }
      const guestPastRides = pastRideMap[guest.name.toLowerCase()] || {}
      const gFragilityShift = fragilityShift(guest.age)
      const isKid = !!(guest.age != null && guest.age < 13)
      const guestCanFitStandard = eligibleHorses.some(h => !h.is_draft && horseWeightCeiling(h.weight, h.name) >= (guest.weight ?? 0))
      const nonRankLastAtLevel = eligibleHorses.filter(h => {
        if (h.rank_last || (guest.weight ?? 0) > horseWeightCeiling(h.weight, h.name)) return false
        const hIdx = LEVEL_ORDER.indexOf(h.level)
        if (hIdx === -1) return false
        const r = horseLevelRangeFn(h.name, hIdx)
        return effectiveGIdxFor(gIdx, h.name, gFragilityShift) >= r.min && effectiveGIdxFor(gIdx, h.name, gFragilityShift) <= r.max
      })
      const includeRankLast = nonRankLastAtLevel.length < 3
      const guestIsAdult = !!(guest.age && guest.age >= 16)

      const candidates = eligibleHorses
        .filter(h => !dbAssignedMap[h.name] && !usedInPass1.has(h.name))
        .filter(h => (guest.weight ?? 0) <= horseWeightCeiling(h.weight, h.name))
        .filter(h => !h.is_draft || !guestCanFitStandard)
        .filter(h => includeRankLast || !h.rank_last)
        .filter(h => !guestPastRides[h.name]?.doesntWork)
        .filter(h => !isKid || h.takes_kids || (horseStats[h.name]?.hasKidHistory ?? false))
        .filter(h => {
          const hIdx = LEVEL_ORDER.indexOf(h.level)
          if (hIdx === -1) return false
          const r = horseLevelRangeFn(h.name, hIdx)
          return effectiveGIdxFor(gIdx, h.name, gFragilityShift) >= r.min && effectiveGIdxFor(gIdx, h.name, gFragilityShift) <= r.max
        })
        .map(h => ({
          horse: h,
          dirScore: levelDirScore(gIdx, LEVEL_ORDER.indexOf(h.level), guest.age ?? undefined),
          weightScore: weightRoutingScore(guest.weight ?? 0, h.name, h.is_draft),
          ageScore: ageRoutingScore(guest.age, h.name),
          margin: horseWeightCeiling(h.weight, h.name) - (guest.weight ?? 0),
        }))
        .sort((a, b) =>
          (Number(a.horse.rank_last) - Number(b.horse.rank_last)) ||
          (guestIsAdult ? Number(a.horse.takes_kids) - Number(b.horse.takes_kids) : 0) ||
          (Number(a.horse.is_draft) - Number(b.horse.is_draft)) ||
          (a.dirScore + a.weightScore + a.ageScore) - (b.dirScore + b.weightScore + b.ageScore) ||
          b.margin - a.margin
        )

      const isSmallGuest = (guest.weight ?? 999) < 80 || (guest.age != null && guest.age < 10)
      const smallCandidates = isSmallGuest ? candidates.filter(c => c.horse.weight != null && c.horse.weight <= 150) : []
      const effectiveCandidates = smallCandidates.length > 0 ? smallCandidates : candidates

      if (effectiveCandidates.length > 0) {
        usedInPass1.add(effectiveCandidates[0].horse.name)
        draft.push({ guest, suggestedHorse: effectiveCandidates[0].horse.name, isDouble: false, needsReview: false, flagged: false })
      } else {
        pass2Queue.push(guest)
      }
    }

    // ── Pass 2: share already-assigned horses (double assignment) ──
    const runtimeDoubleMap: Record<string, { checkOut: string }[]> = { ...dbAssignedMap }
    const pass2Assigned = new Set<string>()
    const pass3Queue: GuestInput[] = []
    const pass3Reasons = new Map<string, 'triple_cap' | 'no_match'>()

    for (const guest of pass2Queue) {
      const gIdx = LEVEL_ORDER.indexOf(guest.riding_level)
      if (gIdx === -1) { pass3Queue.push(guest); pass3Reasons.set(guest.id, 'no_match'); continue }
      const guestPastRides = pastRideMap[guest.name.toLowerCase()] || {}
      const gFragilityShift2 = fragilityShift(guest.age)
      const isKid2 = !!(guest.age != null && guest.age < 13)
      const guestCanFitStandard2 = eligibleHorses.some(h => !h.is_draft && horseWeightCeiling(h.weight, h.name) >= (guest.weight ?? 0))
      const nonRankLastAtLevel2 = eligibleHorses.filter(h => {
        if (h.rank_last || (guest.weight ?? 0) > horseWeightCeiling(h.weight, h.name)) return false
        const hIdx = LEVEL_ORDER.indexOf(h.level)
        if (hIdx === -1) return false
        const r = horseLevelRangeFn(h.name, hIdx)
        return effectiveGIdxFor(gIdx, h.name, gFragilityShift2) >= r.min && effectiveGIdxFor(gIdx, h.name, gFragilityShift2) <= r.max
      })
      const includeRankLast2 = nonRankLastAtLevel2.length < 3
      const guestIsAdult2 = !!(guest.age && guest.age >= 16)

      const totalCount = (h: DbHorse) =>
        (dbAssignedMap[h.name]?.length ?? 0) + (usedInPass1.has(h.name) ? 1 : 0) + (pass2Assigned.has(h.name) ? 1 : 0)

      const candidates2 = eligibleHorses
        .filter(h => (dbAssignedMap[h.name]?.length ?? 0) > 0 || usedInPass1.has(h.name))
        .filter(h => totalCount(h) < 2)
        .filter(h => (guest.weight ?? 0) <= horseWeightCeiling(h.weight, h.name))
        .filter(h => !h.is_draft || !guestCanFitStandard2)
        .filter(h => includeRankLast2 || !h.rank_last)
        .filter(h => !guestPastRides[h.name]?.doesntWork)
        .filter(h => !isKid2 || h.takes_kids || (horseStats[h.name]?.hasKidHistory ?? false))
        .filter(h => {
          const hIdx = LEVEL_ORDER.indexOf(h.level)
          if (hIdx === -1) return false
          const r = horseLevelRangeFn(h.name, hIdx)
          return effectiveGIdxFor(gIdx, h.name, gFragilityShift2) >= r.min && effectiveGIdxFor(gIdx, h.name, gFragilityShift2) <= r.max
        })
        .map(h => {
          const riders = runtimeDoubleMap[h.name] || []
          const soonest = riders.length > 0 ? riders.reduce((min, r) => r.checkOut < min ? r.checkOut : min, riders[0].checkOut) : '9999-99-99'
          return {
            horse: h,
            dirScore: levelDirScore(gIdx, LEVEL_ORDER.indexOf(h.level), guest.age ?? undefined),
            weightScore: weightRoutingScore(guest.weight ?? 0, h.name, h.is_draft),
            ageScore: ageRoutingScore(guest.age, h.name),
            soonest,
          }
        })
        .sort((a, b) =>
          (Number(a.horse.rank_last) - Number(b.horse.rank_last)) ||
          (guestIsAdult2 ? Number(a.horse.takes_kids) - Number(b.horse.takes_kids) : 0) ||
          (Number(a.horse.is_draft) - Number(b.horse.is_draft)) ||
          (a.dirScore + a.weightScore + a.ageScore) - (b.dirScore + b.weightScore + b.ageScore) ||
          a.soonest.localeCompare(b.soonest)
        )

      const isSmallGuest2 = (guest.weight ?? 999) < 80 || (guest.age != null && guest.age < 10)
      const smallCandidates2 = isSmallGuest2 ? candidates2.filter(c => c.horse.weight != null && c.horse.weight <= 150) : []
      const effectiveCandidates2 = smallCandidates2.length > 0 ? smallCandidates2 : candidates2

      if (effectiveCandidates2.length > 0) {
        const best = effectiveCandidates2[0]
        pass2Assigned.add(best.horse.name)
        if (!runtimeDoubleMap[best.horse.name]) runtimeDoubleMap[best.horse.name] = []
        runtimeDoubleMap[best.horse.name].push({ checkOut: guest.check_out_date || '' })
        draft.push({ guest, suggestedHorse: best.horse.name, isDouble: true, needsReview: false, flagged: false })
      } else {
        const wouldFitWithoutCap = eligibleHorses.some(h => {
          if (!((dbAssignedMap[h.name]?.length ?? 0) > 0 || usedInPass1.has(h.name))) return false
          if ((guest.weight ?? 0) > horseWeightCeiling(h.weight, h.name)) return false
          if (guestPastRides[h.name]?.doesntWork) return false
          if (isKid2 && !h.takes_kids && !(horseStats[h.name]?.hasKidHistory ?? false)) return false
          const hIdx = LEVEL_ORDER.indexOf(h.level)
          if (hIdx === -1) return false
          const r = horseLevelRangeFn(h.name, hIdx)
          return effectiveGIdxFor(gIdx, h.name, gFragilityShift2) >= r.min && effectiveGIdxFor(gIdx, h.name, gFragilityShift2) <= r.max
        })
        pass3Queue.push(guest)
        pass3Reasons.set(guest.id, wouldFitWithoutCap ? 'triple_cap' : 'no_match')
      }
    }

    // ── Pass 3: flag remaining guests for manual review ──
    for (const guest of pass3Queue) {
      draft.push({ guest, suggestedHorse: null, isDouble: false, needsReview: true, flagged: false, noHorseReason: pass3Reasons.get(guest.id) ?? 'no_match' })
    }

    console.log(`[assign-all] done in ${Date.now() - t0}ms — ${draft.length} assignments, ${pass3Queue.length} flagged`)
    return NextResponse.json({ draft, pastRideMap }, { headers: { 'Cache-Control': 'no-store' } })

  } catch (err) {
    console.error('[assign-all] unhandled exception:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
