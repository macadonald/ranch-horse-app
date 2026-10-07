import { LEVEL_ORDER } from '@/lib/horses'
import { horseWeightCeiling, horseLevelRange, isHorseBlockedToday } from '@/lib/horseFit'

export type HorseWarningGuest = {
  weight: number | null
  age: number | null
  ridingLevel: string
  existingNotAFitHorse?: boolean
}

export type HorseWarningHorse = {
  level: string
  weight: number | null
  takes_kids: boolean
  flags: { flag_type: string; day_off_date?: string | null }[]
}

export function getHorseWarnings(
  guest: HorseWarningGuest,
  horse: HorseWarningHorse,
  riderCount: number,
  today: string,
): string[] {
  const warnings: string[] = []

  // Active blocking flag
  if (isHorseBlockedToday(horse.flags, today)) {
    const f = horse.flags.find(f => {
      if (f.flag_type === 'day_off') return f.day_off_date === today
      return ['lame', 'injured', 'in_training', 'retired'].includes(f.flag_type)
    })
    warnings.push(`Horse has an active ${f?.flag_type ?? 'health'} flag`)
  }

  // Already at 2 riders on property
  if (riderCount >= 2) {
    warnings.push('Horse already has 2 riders this week')
  }

  // Weight ceiling
  if (guest.weight != null) {
    const ceiling = horseWeightCeiling(horse.weight)
    if (guest.weight > ceiling) {
      warnings.push(`Guest weight (${guest.weight} lbs) exceeds horse's limit (${ceiling} lbs)`)
    }
  }

  // Level range — use default ±1 since we don't have full assignment history client-side
  const base = horse.level === 'I/AI' ? 'I' : horse.level
  const baseIdx = LEVEL_ORDER.indexOf(base)
  if (baseIdx >= 0 && guest.ridingLevel) {
    const guestIdx = LEVEL_ORDER.indexOf(guest.ridingLevel)
    if (guestIdx >= 0) {
      const range = horseLevelRange(baseIdx, 0, [])
      if (guestIdx < range.min || guestIdx > range.max) {
        warnings.push(`Guest level (${guest.ridingLevel}) is outside this horse's range`)
      }
    }
  }

  // Kid on non-kid horse
  if (guest.age != null && guest.age < 13 && !horse.takes_kids) {
    warnings.push('Horse is not approved for guests under 13')
  }

  // Guest's own not-a-fit
  if (guest.existingNotAFitHorse) {
    warnings.push('Horse was previously marked not a fit for this guest')
  }

  return warnings
}
