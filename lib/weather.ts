import { RANCH_LAT, RANCH_LON, RANCH_TIMEZONE } from '@/lib/ranch'

export type WeatherDay = { date: string; highF: number | null; rainIn: number | null }
export type WeatherMap = Record<string, { highF: number | null; rainIn: number | null }>

const COORDS   = `latitude=${RANCH_LAT}&longitude=${RANCH_LON}`
const FIELDS   = `daily=temperature_2m_max,precipitation_sum&temperature_unit=fahrenheit&precipitation_unit=inch&timezone=${encodeURIComponent(RANCH_TIMEZONE)}`
const ARCHIVE  = 'https://archive-api.open-meteo.com/v1/archive'
const FORECAST = 'https://api.open-meteo.com/v1/forecast'

export function addWeatherDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(y, m - 1, d + n)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

function parseDays(data: unknown): WeatherDay[] {
  const d = data as { daily?: { time: string[]; temperature_2m_max: (number|null)[]; precipitation_sum: (number|null)[] } }
  const dates = d?.daily?.time ?? []
  const highs = d?.daily?.temperature_2m_max ?? []
  const rains = d?.daily?.precipitation_sum   ?? []
  return dates.map((date, i) => ({ date, highF: highs[i] ?? null, rainIn: rains[i] ?? null }))
}

export async function fetchWeather(
  start: string,
  end: string,
  today: string,
): Promise<{ map: WeatherMap; errors?: string[] }> {
  const archiveCutoff = addWeatherDays(today, -6)
  const days: WeatherDay[] = []
  const seen = new Set<string>()
  const errors: string[] = []

  if (start <= archiveCutoff) {
    const archiveEnd = end <= archiveCutoff ? end : archiveCutoff
    let chunkStart = start
    while (chunkStart <= archiveEnd) {
      const chunkEnd = (() => {
        const candidate = addWeatherDays(chunkStart, 364)
        return candidate <= archiveEnd ? candidate : archiveEnd
      })()
      const url = `${ARCHIVE}?${COORDS}&${FIELDS}&start_date=${chunkStart}&end_date=${chunkEnd}`
      try {
        const res = await fetch(url, { next: { revalidate: 86400 } } as RequestInit)
        if (res.ok) {
          for (const d of parseDays(await res.json()))
            if (!seen.has(d.date)) { days.push(d); seen.add(d.date) }
        } else {
          errors.push(`archive ${chunkStart}–${chunkEnd}: HTTP ${res.status}`)
        }
      } catch (e) {
        errors.push(`archive ${chunkStart}–${chunkEnd}: ${String(e)}`)
      }
      chunkStart = addWeatherDays(chunkEnd, 1)
    }
  }

  if (end >= archiveCutoff) {
    const url = `${FORECAST}?${COORDS}&${FIELDS}&past_days=7&forecast_days=8`
    try {
      const res = await fetch(url, { next: { revalidate: 10800 } } as RequestInit)
      if (res.ok) {
        for (const d of parseDays(await res.json()))
          if (d.date >= start && d.date <= end && !seen.has(d.date)) { days.push(d); seen.add(d.date) }
      } else {
        errors.push(`forecast: HTTP ${res.status}`)
      }
    } catch (e) {
      errors.push(`forecast: ${String(e)}`)
    }
  }

  days.sort((a, b) => a.date.localeCompare(b.date))
  const map: WeatherMap = {}
  for (const d of days) map[d.date] = { highF: d.highF, rainIn: d.rainIn }
  return errors.length ? { map, errors } : { map }
}
