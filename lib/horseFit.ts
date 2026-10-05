import { LEVEL_ORDER } from '@/lib/horses'

/**
 * Effective weight ceiling for a horse.
 * Base is listed + 15, extended by historical max rides up to listed + 30.
 */
export function horseWeightCeiling(listed: number | null, historicalMaxWeight = 0): number {
  if (listed === null) return 0
  return Math.min(listed + 30, Math.max(listed + 15, historicalMaxWeight))
}

/**
 * Level index range a horse can suit.
 * < 5 assignments → base ±1 (default).
 * ≥ 5 → expands by historical min/max, floor at base−1.
 * ≥ 20 and never above base → max capped at base.
 */
export function horseLevelRange(
  baseLevelIdx: number,
  totalAssignments = 0,
  historicalLevels: string[] = []
): { min: number; max: number } {
  const len = LEVEL_ORDER.length
  if (totalAssignments < 5) {
    return { min: Math.max(0, baseLevelIdx - 1), max: Math.min(len - 1, baseLevelIdx + 1) }
  }
  let lo = baseLevelIdx, hi = baseLevelIdx
  for (const lvl of historicalLevels) {
    const i = LEVEL_ORDER.indexOf(lvl)
    if (i !== -1) { if (i < lo) lo = i; if (i > hi) hi = i }
  }
  if (totalAssignments >= 20 && hi <= baseLevelIdx) {
    return { min: Math.max(0, lo), max: baseLevelIdx }
  }
  return {
    min: Math.max(0, Math.min(lo, baseLevelIdx - 1)),
    max: Math.min(len - 1, hi),
  }
}

/**
 * True if a horse has an active blocking flag for the given date (YYYY-MM-DD, Tucson).
 * Blocking types: lame, injured, in_training, retired; day_off only when date matches.
 */
export function isHorseBlockedToday(
  flags: { flag_type: string; day_off_date?: string | null }[],
  today: string
): boolean {
  return flags.some(f => {
    if (f.flag_type === 'day_off') return f.day_off_date === today
    return ['lame', 'injured', 'in_training', 'retired'].includes(f.flag_type)
  })
}
