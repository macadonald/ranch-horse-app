import { DetectorResult, DetectorStatus, Finding, FindingCategory, PatternFlag, PatternGuest, PatternHorse, PatternVisit } from './types'
import { detectCalendar } from './calendar'
import { detectGuestShifts } from './guests'
import { detectWeather } from './weather'
import { detectSwaps } from './swaps'
import { detectHealth } from './health'
import { detectShoes } from './shoes'
import { detectHorses } from './horses'
import { WeatherMap } from '@/lib/weather'

export type { Finding, FindingCategory, DetectorStatus } from './types'

export interface DetectorInput {
  guests: PatternGuest[]
  flags: PatternFlag[]
  visits: PatternVisit[]
  horses: PatternHorse[]
  weatherMap: WeatherMap
  today: string
}

export interface AllDetectorsResult {
  findings: Finding[]
  statuses: DetectorStatus[]
}

function tryDetect(
  category: FindingCategory,
  fallbackChecked: string,
  fn: () => DetectorResult,
): DetectorResult {
  try {
    return fn()
  } catch (err) {
    return {
      findings: [],
      status: {
        category,
        checked: fallbackChecked,
        error: err instanceof Error ? err.message : String(err),
      },
    }
  }
}

export function runAllDetectors(input: DetectorInput): AllDetectorsResult {
  const { guests, flags, visits, horses, weatherMap, today } = input

  const results: DetectorResult[] = [
    tryDetect('calendar', 'check-ins', () => detectCalendar(guests)),
    tryDetect('guests',   'guests',    () => detectGuestShifts(guests, today)),
    tryDetect('weather',  'weather data', () => detectWeather(guests, weatherMap, today)),
    tryDetect('swaps',    'assignments', () => detectSwaps(guests)),
    tryDetect('health',   'health flags', () => detectHealth(guests, flags)),
    tryDetect('shoes',    'shoeing history', () => detectShoes(guests, visits, horses, today)),
    tryDetect('horses',   'active horses', () => detectHorses(guests, horses, today)),
  ]

  const allFindings = results.flatMap(r => r.findings)

  // Sort: action before background, then strong before moderate
  allFindings.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'action' ? -1 : 1
    if (a.strength !== b.strength) return a.strength === 'strong' ? -1 : 1
    return 0
  })

  return {
    findings: allFindings,
    statuses: results.map(r => r.status),
  }
}
