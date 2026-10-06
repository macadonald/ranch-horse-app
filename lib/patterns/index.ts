import { Finding, PatternFlag, PatternGuest, PatternVisit } from './types'
import { detectCalendar } from './calendar'
import { detectGuestShifts } from './guests'
import { detectWeather } from './weather'
import { detectSwaps } from './swaps'
import { detectHealth } from './health'
import { detectShoes } from './shoes'
import { WeatherMap } from '@/lib/weather'

export type { Finding, FindingCategory } from './types'

export interface DetectorInput {
  guests: PatternGuest[]
  flags: PatternFlag[]
  visits: PatternVisit[]
  weatherMap: WeatherMap
  today: string
}

export function runAllDetectors(input: DetectorInput): Finding[] {
  const { guests, flags, visits, weatherMap, today } = input
  const all: Finding[] = [
    ...detectCalendar(guests),
    ...detectGuestShifts(guests, today),
    ...detectWeather(guests, weatherMap, today),
    ...detectSwaps(guests),
    ...detectHealth(guests, flags),
    ...detectShoes(guests, visits),
  ]
  // Strong findings first, then moderate; within tier preserve detector order
  return all.sort((a, b) => {
    if (a.strength === b.strength) return 0
    return a.strength === 'strong' ? -1 : 1
  })
}
